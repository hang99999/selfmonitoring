# 小暖 App — 项目上下文

> 本文件供 Claude Code、Codex 等 AI 工具读取，提供项目完整背景。

---

## 产品概述

**产品名：小暖**，一个基于 **BATD-R（Brief Behavioral Activation Treatment for Depression - Revised）** 的心理健康研究型 App，AI 伙伴陪伴情绪低落用户通过行为激活改善情绪。

**核心理念：** 行为先于情绪——不等心情好了再行动，先行动情绪慢慢跟上。

**主要功能：**
1. 活动记录（LLM 提取结构化数据：愉悦度/重要性 0-10、情绪类型）
2. 活动计划 & 完成率跟踪
3. 活动库（生活领域 → 价值观 → 具体活动三级结构）
4. 分析模块（折线图、雷达图、心理测试、每日/每周总结）
5. AI 聊天伙伴"小暖"（5 种对话模式 A-E + 10 种触发场景）

**用户群体：** 研究参与者，研究行为激活疗法的数字化效果。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React Native + Expo，NativeWind/Tailwind |
| 后端 | FastAPI + PostgreSQL |
| LLM | yunwu.ai 代理（OpenAI 兼容格式），生产模型以 `.env.production` 的 `LLM_MODEL` 为准，最近配置为 `gpt-5.5` |
| 部署 | 阿里云 ECS 香港，systemd 24/7 运行 |

---

## 仓库 & Git

- **GitHub：** `https://github.com/hang99999/selfmonitoring.git`
- **主分支：** `main`
- **git user：** hang99999

---

## 云服务器

| 项目 | 值 |
|---|---|
| 公网 IP | `47.239.197.238` |
| 系统 | Ubuntu 22.04，2核4GiB，阿里云 ECS 香港 |
| 代码路径 | `/root/repo/backend` |
| Python venv | `/root/repo/backend/venv` |
| systemd 服务名 | `xiaonuan` |
| 环境变量文件 | `/root/repo/backend/.env.production` |
| LLM base URL | `https://yunwu.ai`（OpenAI 兼容格式） |
| pgAdmin | 可视化管理 PostgreSQL |

**标准部署命令：**
```bash
cd /root/repo && git pull origin main && sudo systemctl restart xiaonuan
```

**改 .env 后重启：**
```bash
sudo systemctl restart xiaonuan
```

**前端 API base URL：** `http://47.239.197.238:8000`

---

## 后端文件结构

```
backend/app/
├── main.py               # FastAPI 入口，路由注册
├── models.py             # SQLAlchemy ORM 模型
├── schemas.py            # Pydantic 请求/响应 schema
├── database.py           # DB 连接配置
├── llm_client.py         # yunwu.ai LLM 调用封装
├── routers/
│   ├── chatbot.py        # AI 对话路由（核心业务）
│   ├── activities.py     # 活动库 CRUD
│   ├── records.py        # 活动记录 CRUD
│   ├── auth.py           # 用户认证
│   ├── insights.py       # 分析/洞察
│   ├── stats.py          # 统计数据
│   └── supporters.py     # 支持者功能
└── prompts/
    ├── core.py           # 主 prompt 构建入口
    ├── builder.py        # prompt 拼装逻辑
    ├── context.py        # 用户状态数据注入 chatbot prompt
    ├── _db.py            # system_prompts 表读取
    ├── analysis.py       # 分析模块 prompt
    ├── free_chat.py      # 自由聊天 prompt
    ├── phases/           # 分阶段引导 prompt（S1-S4 对应用户使用周期）
    │   ├── s1_intro.py   # 第1阶段：初次介绍
    │   ├── s2_setup.py   # 第2阶段：价值观/活动设置
    │   ├── s3_first_review.py  # 第3阶段：首次回顾
    │   └── s4_review_cycle.py  # 第4阶段：周期回顾
    └── triggers/         # 10 种触发对话（首次使用、连续无记录等）
```

---

## AI 伙伴对话逻辑

**5 种对话模式（小暖）：**
- 模式 A：情绪支持 → 行为引导
- 模式 B：正强化与意义连接
- 模式 C：困难疏通（活动拆解）
- 模式 D：治疗原理答疑（去异步现象、负强化陷阱等）
- 模式 E：轻度签到

**用户状态数据注入 prompt：** 注册天数、记录数、活动完成率、情绪趋势等，由 `prompts/context.py` 构建后注入 chatbot prompt，决定触发哪种对话模式。

**分阶段逻辑：** 用户按使用周期处于 S1-S4 其中一个阶段，每阶段有对应 system prompt，由 `PhaseConfig`（全局配置）控制切换。

---

## 开发注意事项

- 功能改动须符合 BA 疗法（行为激活）原则
- LLM 配置：`OPENAI_BASE_URL=https://yunwu.ai`，`LLM_PROVIDER` 默认 openai（yunwu.ai 是 OpenAI 兼容格式）
- `system_prompts` 表已手动 seed（6 条 prompt），自动 seeding 有 fallback 兜底
- S1 阶段不注入 `session_ctx`，避免模型提及用户记录数据

---

## 当前进度

- 四阶段 prompt（S1-S4）已完成第一版重构，进入真实对话测试与小步迭代阶段
- 当前重点：测试 S1-S4 是否按阶段工作流推进、是否保持小暖语气、是否每轮只问一个问题、是否能把回顾落到下一步行动
- 本地尚有 prompt 相关改动待提交并同步到服务器
