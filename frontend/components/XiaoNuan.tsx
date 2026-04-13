import Svg, { Circle, Ellipse, Path, Defs, RadialGradient, Stop } from 'react-native-svg';

export default function XiaoNuan({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <RadialGradient id="warmGradient" cx="0.4" cy="0.35" r="0.65">
          <Stop offset="0%" stopColor="#FFF7ED" />
          <Stop offset="100%" stopColor="#FDBA74" />
        </RadialGradient>
      </Defs>
      <Circle cx="60" cy="60" r="56" fill="url(#warmGradient)" />
      <Circle cx="60" cy="60" r="56" stroke="#F97316" strokeWidth="2" opacity={0.3} />
      {/* Left eye */}
      <Ellipse cx="44" cy="50" rx="4" ry="5" fill="#5B3A1A" />
      <Circle cx="45.5" cy="48" r="1.5" fill="white" />
      {/* Right eye */}
      <Ellipse cx="76" cy="50" rx="4" ry="5" fill="#5B3A1A" />
      <Circle cx="77.5" cy="48" r="1.5" fill="white" />
      {/* Smile */}
      <Path d="M44 68 Q60 82 76 68" stroke="#5B3A1A" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Cheeks */}
      <Ellipse cx="34" cy="66" rx="8" ry="5" fill="#FDBA74" opacity={0.6} />
      <Ellipse cx="86" cy="66" rx="8" ry="5" fill="#FDBA74" opacity={0.6} />
      {/* Heart */}
      <Path d="M60 18 C56 12, 48 14, 48 20 C48 26, 60 32, 60 32 C60 32, 72 26, 72 20 C72 14, 64 12, 60 18Z" fill="#FB923C" opacity={0.7} />
    </Svg>
  );
}
