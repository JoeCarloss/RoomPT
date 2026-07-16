import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

interface SetupGuideScreenProps {
  onStart: () => void;
}

function SetupDiagram() {
  const width = 320;
  const height = 200;
  const groundY = 170;
  const phoneX = 60;
  const personX = 270;

  return (
    <Svg width={width} height={height}>
      {/* 바닥선 */}
      <Line x1={10} y1={groundY} x2={width - 10} y2={groundY} stroke="#334155" strokeWidth={2} />

      {/* 휴대폰 (세로로 세워둔 모습) */}
      <Rect
        x={phoneX - 12}
        y={groundY - 70}
        width={24}
        height={70}
        rx={4}
        stroke="#00e5ff"
        strokeWidth={2}
        fill="none"
      />
      <Circle cx={phoneX} cy={groundY - 12} r={2} fill="#00e5ff" />
      <SvgText x={phoneX} y={groundY + 20} fontSize={11} fill="#94a3b8" textAnchor="middle">
        내 폰
      </SvgText>

      {/* 사람 (스틱 피규어, 전신) */}
      <Circle cx={personX} cy={groundY - 92} r={10} stroke="#39ff14" strokeWidth={2} fill="none" />
      <Line x1={personX} y1={groundY - 82} x2={personX} y2={groundY - 40} stroke="#39ff14" strokeWidth={2} />
      <Line x1={personX} y1={groundY - 72} x2={personX - 16} y2={groundY - 55} stroke="#39ff14" strokeWidth={2} />
      <Line x1={personX} y1={groundY - 72} x2={personX + 16} y2={groundY - 55} stroke="#39ff14" strokeWidth={2} />
      <Line x1={personX} y1={groundY - 40} x2={personX - 12} y2={groundY} stroke="#39ff14" strokeWidth={2} />
      <Line x1={personX} y1={groundY - 40} x2={personX + 12} y2={groundY} stroke="#39ff14" strokeWidth={2} />

      {/* 거리 표시 */}
      <Line
        x1={phoneX + 20}
        y1={groundY - 90}
        x2={personX - 20}
        y2={groundY - 90}
        stroke="#ff7b00"
        strokeWidth={1.5}
        strokeDasharray="4,4"
      />
      <SvgText
        x={(phoneX + personX) / 2}
        y={groundY - 98}
        fontSize={12}
        fill="#ff7b00"
        textAnchor="middle"
      >
        2~3m
      </SvgText>

      {/* 카메라 높이 표시 */}
      <Line
        x1={phoneX}
        y1={groundY - 35}
        x2={phoneX}
        y2={groundY - 45}
        stroke="#ff2a6d"
        strokeWidth={2}
      />
      <SvgText x={phoneX - 35} y={groundY - 45} fontSize={10} fill="#ff2a6d" textAnchor="middle">
        허리 높이
      </SvgText>
      <SvgText x={phoneX - 35} y={groundY - 33} fontSize={10} fill="#ff2a6d" textAnchor="middle">
        수직 거치
      </SvgText>
    </Svg>
  );
}

export function SetupGuideScreen({ onStart }: SetupGuideScreenProps) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>카메라 설치 가이드</Text>
        <Text style={styles.subtitle}>이렇게 두면 인식이 가장 잘 됩니다</Text>

        <View style={styles.diagramCard}>
          <SetupDiagram />
        </View>

        <GuideItem
          emoji="📏"
          title="거리: 2~3m"
          desc="전신(머리부터 발까지)이 화면에 다 들어오도록 충분히 떨어뜨려 두세요."
        />
        <GuideItem
          emoji="🧍"
          title="방향: 정면 촬영 권장"
          desc="정면을 보고 서면 무릎 모임, 골반 기울기 등 모든 자세 피드백을 받을 수 있어요. 측면 촬영도 되지만 일부 피드백(무릎 모임 감지)은 정면일 때만 동작합니다."
        />
        <GuideItem
          emoji="📱"
          title="높이: 허리~가슴 높이, 수직으로 거치"
          desc="바닥에 눕혀두지 말고 세로로 세워서, 바닥에서 허리~가슴 정도 높이에 고정해두세요. 기울어지면 각도 판정이 부정확해질 수 있어요."
        />
        <GuideItem
          emoji="💡"
          title="밝은 곳에서 촬영"
          desc="역광(창문을 등지고 서는 것)은 피하고, 몸 전체가 밝게 보이는 곳에서 진행하세요."
        />
        <GuideItem
          emoji="👖"
          title="무릎·발목이 잘 보이는 복장"
          desc="통 넓은 바지보다는 무릎 라인이 드러나는 복장이 인식에 유리합니다."
        />

        <Pressable style={styles.startButton} onPress={onStart}>
          <Text style={styles.startButtonText}>시작하기</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function GuideItem({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <View style={styles.guideItem}>
      <Text style={styles.guideEmoji}>{emoji}</Text>
      <View style={styles.guideTextBlock}>
        <Text style={styles.guideTitle}>{title}</Text>
        <Text style={styles.guideDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 64,
    paddingBottom: 48,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
  },
  diagramCard: {
    backgroundColor: '#131a2c',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 20,
  },
  guideItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
    alignItems: 'flex-start',
  },
  guideEmoji: {
    fontSize: 22,
  },
  guideTextBlock: {
    flex: 1,
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 2,
  },
  guideDesc: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 19,
  },
  startButton: {
    marginTop: 12,
    backgroundColor: '#00e5ff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
});
