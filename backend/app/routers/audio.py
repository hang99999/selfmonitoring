import base64
import hashlib
import hmac
import os
import uuid
import aiofiles
import httpx
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote as url_quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AudioRecord, User
from app.schemas import AudioRecordResponse, AudioUploadResponse

router = APIRouter(prefix="/api/audio", tags=["audio"])

ASR_PROVIDER = "aliyun-nls"

NLS_TOKEN_URL = "https://nls-meta.cn-shanghai.aliyuncs.com/pop/2018-05-18/tokens"
NLS_ASR_URL   = "https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr"

ALLOWED_MIME_TYPES = {
    "audio/mp4", "audio/m4a", "audio/x-m4a",
    "audio/mpeg", "audio/wav", "audio/x-wav",
    "audio/webm", "audio/ogg",
    "application/octet-stream",
}

MIME_TO_EXT = {
    "audio/mp4": ".m4a", "audio/m4a": ".m4a", "audio/x-m4a": ".m4a",
    "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav",
    "audio/webm": ".webm", "audio/ogg": ".ogg",
}

EXT_TO_MIME = {
    ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".webm": "audio/webm", ".ogg": "audio/ogg",
}

# 阿里云 NLS：扩展名 → format 参数
EXT_TO_NLS_FORMAT = {
    ".m4a": "aac", ".mp3": "mp3", ".wav": "wav",
    ".webm": "opus", ".ogg": "ogg",
}


async def _get_nls_token(access_key_id: str, access_key_secret: str) -> str:
    """用 AccessKey 换取阿里云 NLS 临时 Token（有效期约 24 小时）。"""
    params = {
        "AccessKeyId": access_key_id,
        "Action": "CreateToken",
        "Format": "JSON",
        "RegionId": "cn-shanghai",
        "SignatureMethod": "HMAC-SHA1",
        "SignatureNonce": uuid.uuid4().hex,
        "SignatureVersion": "1.0",
        "Timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "Version": "2019-02-28",
    }

    sorted_items = sorted(params.items())
    canonical = "&".join(
        f"{url_quote(k, safe='~')}={url_quote(v, safe='~')}"
        for k, v in sorted_items
    )
    string_to_sign = f"POST&{url_quote('/', safe='~')}&{url_quote(canonical, safe='~')}"

    sign_key = (access_key_secret + "&").encode("utf-8")
    signature = base64.b64encode(
        hmac.new(sign_key, string_to_sign.encode("utf-8"), hashlib.sha1).digest()
    ).decode()
    params["Signature"] = signature

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(NLS_TOKEN_URL, data=params)
    resp.raise_for_status()
    data = resp.json()

    token = data.get("Token", {}).get("Id")
    if not token:
        raise RuntimeError(f"获取 NLS Token 失败: {data}")
    return token


async def _aliyun_transcribe(file_path: str) -> str:
    """调用阿里云一句话识别，返回转写文字。"""
    access_key_id     = os.getenv("ALIYUN_ACCESS_KEY_ID", "")
    access_key_secret = os.getenv("ALIYUN_ACCESS_KEY_SECRET", "")
    appkey            = os.getenv("ALIYUN_NLS_APPKEY", "")

    if not all([access_key_id, access_key_secret, appkey]):
        raise ValueError("阿里云 ASR 配置不完整，请检查 ALIYUN_ACCESS_KEY_ID / SECRET / NLS_APPKEY")

    token = await _get_nls_token(access_key_id, access_key_secret)

    ext        = Path(file_path).suffix.lower()
    nls_format = EXT_TO_NLS_FORMAT.get(ext, "aac")

    with open(file_path, "rb") as f:
        audio_bytes = f.read()

    params = {
        "appkey":                          appkey,
        "format":                          nls_format,
        "sample_rate":                     "16000",
        "enable_punctuation_prediction":   "true",
        "enable_inverse_text_normalization": "true",
        "enable_voice_detection":          "true",
    }
    headers = {
        "X-NLS-Token":  token,
        "Content-Type": "application/octet-stream",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(NLS_ASR_URL, params=params, headers=headers, content=audio_bytes)

    data = resp.json()
    if data.get("status") != 20000000:
        raise RuntimeError(f"阿里云 ASR 错误 {data.get('status')}: {data.get('message', data)}")

    return data.get("result", "").strip()


@router.post("/upload", response_model=AudioUploadResponse)
async def upload_audio(
    file: UploadFile = File(...),
    user_id: str = Form(default="default_user"),
    db: Session = Depends(get_db),
):
    """上传音频 → 阿里云 ASR 转写 → 保存 AudioRecord → 返回 transcript。"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id)
        db.add(user)
        db.commit()

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"不支持的音频格式: {content_type}")

    original_ext = Path(file.filename or "audio").suffix.lower()
    ext = original_ext if original_ext in EXT_TO_MIME else MIME_TO_EXT.get(content_type, ".m4a")

    audio_id  = str(uuid.uuid4())
    month_dir = Path("uploads") / "audio" / user_id / datetime.now().strftime("%Y%m")
    month_dir.mkdir(parents=True, exist_ok=True)
    file_path = month_dir / f"{audio_id}{ext}"

    content = await file.read()
    async with aiofiles.open(str(file_path), "wb") as f:
        await f.write(content)

    transcript  = ""
    asr_error: Optional[str] = None
    try:
        transcript = await _aliyun_transcribe(str(file_path))
    except Exception as e:
        asr_error = str(e)

    audio_record = AudioRecord(
        id=audio_id,
        user_id=user_id,
        file_path=str(file_path),
        file_size_bytes=len(content),
        transcript_text=transcript,
        whisper_model=ASR_PROVIDER,
    )
    db.add(audio_record)
    db.commit()

    return AudioUploadResponse(
        audio_record_id=audio_id,
        transcript=transcript,
        file_size_bytes=len(content),
        whisper_error=asr_error,
    )


@router.get("/{audio_record_id}/file")
async def get_audio_file(
    audio_record_id: str,
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """鉴权后流式返回音频文件。"""
    record = db.query(AudioRecord).filter(AudioRecord.id == audio_record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="音频记录不存在")
    if record.user_id != user_id:
        raise HTTPException(status_code=403, detail="无权访问该录音")

    file_path = Path(record.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="音频文件不存在于服务器")

    media_type = EXT_TO_MIME.get(file_path.suffix.lower(), "audio/mp4")
    return FileResponse(path=str(file_path), media_type=media_type, filename=file_path.name)


@router.get("/{audio_record_id}", response_model=AudioRecordResponse)
async def get_audio_record(
    audio_record_id: str,
    user_id: str = Query(default="default_user"),
    db: Session = Depends(get_db),
):
    """获取录音元数据（不含文件内容）。"""
    record = db.query(AudioRecord).filter(AudioRecord.id == audio_record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="音频记录不存在")
    if record.user_id != user_id:
        raise HTTPException(status_code=403, detail="无权访问该录音")
    return record
