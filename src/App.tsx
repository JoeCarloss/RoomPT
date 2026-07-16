import { useEffect, useRef, useState } from 'react';

// TypeScript declarations for global MediaPipe SDK loaded via CDN
declare global {
  interface Window {
    Pose: any;
    Camera: any;
  }
}

interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

interface JointAngle {
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // App States
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [squatCount, setSquatCount] = useState<number>(0);
  const [angles, setAngles] = useState<JointAngle>({ leftKnee: 180, rightKnee: 180, leftHip: 180, rightHip: 180 });
  const [squatState, setSquatState] = useState<'UP' | 'DOWN' | 'WARNING'>('UP');
  const [feedback, setFeedback] = useState<string>('카메라 앞에 서서 스쿼트 동작을 시작하세요.');
  const [feedbackLogs, setFeedbackLogs] = useState<{ id: number; time: string; text: string; type: 'success' | 'warn' | 'info' }[]>([]);

  // Ref variables for tracking pose states across render cycles
  const poseStateRef = useRef<'UP' | 'DOWN'>('UP');
  const lastSpokenTimeRef = useRef<number>(0);
  const cameraInstanceRef = useRef<any>(null);
  const poseInstanceRef = useRef<any>(null);

  // Add log to the panel
  const addLog = (text: string, type: 'success' | 'warn' | 'info') => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setFeedbackLogs((prev) => [{ id: Date.now(), time, text, type }, ...prev.slice(0, 19)]);
  };

  // TTS (Text-to-Speech) Helper with Cooldown to prevent spamming
  const speak = (text: string, force: boolean = false) => {
    if (!('speechSynthesis' in window)) return;
    
    const now = Date.now();
    // 3 seconds cooldown for general feedbacks to prevent overlapping voice
    if (!force && now - lastSpokenTimeRef.current < 3000) {
      return;
    }

    // If forcing (like count announcement), cancel current speak
    if (force) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.05; // Slightly faster for active responses
    
    // Choose a natural-sounding Korean voice if available
    const voices = window.speechSynthesis.getVoices();
    const krVoice = voices.find(voice => voice.lang.includes('KO') || voice.lang.includes('ko'));
    if (krVoice) {
      utterance.voice = krVoice;
    }

    window.speechSynthesis.speak(utterance);
    lastSpokenTimeRef.current = now;
  };

  // Vector calculation helper for joints angle
  const calculateAngle = (p1: Landmark, p2: Landmark, p3: Landmark): number => {
    // Vectors p2 -> p1 and p2 -> p3
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    const dotProduct = v1.x * v2.x + v1.y * v2.y;
    const magnitude1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const magnitude2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    let angle = Math.acos(dotProduct / (magnitude1 * magnitude2));
    angle = angle * (180 / Math.PI); // Convert to degrees

    return angle;
  };

  // Initialize MediaPipe Pose Model
  useEffect(() => {
    const checkSDK = setInterval(() => {
      if (window.Pose && window.Camera) {
        clearInterval(checkSDK);
        initPose();
      }
    }, 500);

    return () => {
      clearInterval(checkSDK);
      if (cameraInstanceRef.current) cameraInstanceRef.current.stop();
    };
  }, []);

  const initPose = () => {
    const pose = new window.Pose({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults(onPoseResults);
    poseInstanceRef.current = pose;
    setIsModelLoading(false);
    addLog('MediaPipe Pose AI 모델 로드 완료', 'success');
    speak('AI 코칭 준비가 완료되었습니다.', true);
  };

  // Handle Pose Results & Compute Squat Logic
  const onPoseResults = (results: any) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Adjust canvas size dynamically to match container aspect ratio
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    // Draw camera frame onto canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (!results.poseLandmarks) {
      // Body not detected
      setFeedback('카메라 앵글 안에 전신이 나오도록 서 주세요.');
      return;
    }

    const landmarks: Landmark[] = results.poseLandmarks;

    // Extract necessary joint indices
    // Left side: Shoulder(11), Hip(23), Knee(25), Ankle(27)
    // Right side: Shoulder(12), Hip(24), Knee(26), Ankle(28)
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    // Compute joint angles
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const leftHipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    const rightHipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);



    setAngles({
      leftKnee: leftKneeAngle,
      rightKnee: rightKneeAngle,
      leftHip: leftHipAngle,
      rightHip: rightHipAngle,
    });

    // Drawing Skeletal Connections with Neon Styling
    drawSkeleton(ctx, landmarks, canvas.width, canvas.height);

    // 🏋️‍♂️ Squat Rule-based State Machine
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    
    // Knee Collapse (무릎 모임) 감지
    // 무릎 너비와 발목 너비를 비교
    const kneeWidth = Math.abs(leftKnee.x - rightKnee.x);
    const ankleWidth = Math.abs(leftAnkle.x - rightAnkle.x);

    let isKneeCollapsing = false;
    
    // 스쿼트로 앉은 상태(무릎 각도가 120도 이하)일 때 무릎 거리가 발목 거리보다 급격히 좁아지면 모임 감지
    if (avgKneeAngle < 120 && kneeWidth < ankleWidth * 0.75) {
      isKneeCollapsing = true;
    }

    if (isKneeCollapsing) {
      setSquatState('WARNING');
      setFeedback('주의: 무릎이 안으로 모이고 있습니다. 발끝 방향으로 무릎을 넓혀주세요!');
      speak('무릎이 안으로 모이고 있습니다. 발끝 방향으로 무릎을 열어주세요.');
      addLog('무릎 안쪽 모임 감지 (자세 경고)', 'warn');
    } else if (avgKneeAngle < 95) {
      // Fully sat down (DOWN state)
      if (poseStateRef.current === 'UP') {
        poseStateRef.current = 'DOWN';
        setSquatState('DOWN');
        setFeedback('완전히 내려왔습니다. 천천히 무릎과 엉덩이를 펴며 일어서세요.');
        addLog('하강 상태 도달 (충분한 깊이)', 'info');
      }
    } else if (avgKneeAngle > 155) {
      // Stood up fully (UP state)
      if (poseStateRef.current === 'DOWN') {
        poseStateRef.current = 'UP';
        setSquatState('UP');
        setSquatCount(c => {
          const nextCount = c + 1;
          speak(`${nextCount}회!`, true);
          addLog(`스쿼트 1회 성공! (누적 ${nextCount}회)`, 'success');
          return nextCount;
        });
        setFeedback('좋습니다! 다음 횟수를 위해 천천히 내려가세요.');
      } else {
        setSquatState('UP');
        setFeedback('몸을 곧게 펴고 스쿼트를 준비하세요.');
      }
    } else {
      // In-between state
      if (poseStateRef.current === 'DOWN') {
        setFeedback('천천히 엉덩이를 뒤로 밀어 일어나세요.');
      } else {
        setFeedback('천천히 깊숙하게 앉으세요. 골반이 무릎 위치까지 내려가야 합니다.');
      }
    }
  };

  // Helper function to draw neon joints and bones
  const drawSkeleton = (ctx: CanvasRenderingContext2D, landmarks: Landmark[], width: number, height: number) => {
    const CONNECTIONS = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Upper body
      [11, 23], [12, 24], [23, 24], // Torso
      [23, 25], [25, 27], [24, 26], [26, 28] // Lower body
    ];

    // Draw bones (Lines)
    ctx.lineWidth = 4;
    CONNECTIONS.forEach(([i, j]) => {
      const p1 = landmarks[i];
      const p2 = landmarks[j];

      if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        
        // Add neon glow effect
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
        ctx.stroke();
      }
    });

    // Draw joints (Circles)
    ctx.shadowBlur = 0; // Reset shadow for joints
    const jointsOfInterest = [11, 12, 23, 24, 25, 26, 27, 28];
    jointsOfInterest.forEach(idx => {
      const landmark = landmarks[idx];
      if (landmark && landmark.visibility > 0.5) {
        const x = landmark.x * width;
        const y = landmark.y * height;

        // Draw outer glow circle
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = idx % 2 === 0 ? 'rgba(57, 255, 20, 0.4)' : 'rgba(255, 42, 109, 0.4)';
        ctx.fill();

        // Draw inner solid circle
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    });
  };

  // Toggle Camera
  const toggleCoaching = async () => {
    if (isRunning) {
      if (cameraInstanceRef.current) {
        cameraInstanceRef.current.stop();
      }
      setIsRunning(false);
      speak('코칭을 일시 중지합니다.', true);
      addLog('카메라 코칭 중지됨', 'info');
    } else {
      if (!videoRef.current) return;

      setIsRunning(true);
      addLog('카메라 전원 켜는 중...', 'info');

      try {
        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (poseInstanceRef.current && isRunning) {
              await poseInstanceRef.current.send({ image: videoRef.current! });
            }
          },
          width: 640,
          height: 480,
        });

        cameraInstanceRef.current = camera;
        await camera.start();
        addLog('실시간 카메라 감지 작동 중', 'success');
        speak('실시간 자세 분석을 시작합니다. 정면 또는 측면이 보이도록 해주세요.', true);
      } catch (err) {
        console.error(err);
        addLog('카메라 시작 실패: 기기에 웹캠이 활성화되어 있는지 확인하세요.', 'warn');
        setIsRunning(false);
      }
    }
  };

  // Reset metrics
  const resetStats = () => {
    setSquatCount(0);
    setFeedbackLogs([]);
    poseStateRef.current = 'UP';
    setSquatState('UP');
    speak('운동 기록을 초기화했습니다.', true);
    addLog('카운트 및 히스토리 초기화됨', 'info');
  };

  return (
    <div className="min-height-screen p-4 md:p-8 flex flex-col max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="material-icons-round text-3xl text-[var(--accent-electric-blue)] animate-pulse-slow">
            fitness_center
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              RoomPT <span className="text-xs bg-[var(--accent-electric-blue)] text-black px-2 py-0.5 rounded font-black tracking-widest">POC V1</span>
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">AI Real-time Home Training Coach</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button
            onClick={resetStats}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--bg-tertiary)] border border-[var(--glass-border)] hover:bg-gray-800 text-[var(--text-primary)] transition"
          >
            <span className="material-icons-round text-sm">refresh</span>
            초기화
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-grow">
        {/* Left Side: Video Capture and Skeleton Overlay */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="glass-panel overflow-hidden relative aspect-video flex items-center justify-center bg-black rounded-2xl border border-[var(--glass-border)]">
            {isModelLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0f19] z-20 gap-4">
                <div className="w-12 h-12 border-4 border-[var(--accent-electric-blue)] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-medium tracking-wide text-[var(--text-secondary)]">
                  AI Pose Model loading...
                </p>
              </div>
            )}

            {!isModelLoading && !isRunning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black bg-opacity-70 gap-4 p-6 text-center">
                <span className="material-icons-round text-6xl text-[var(--accent-electric-blue)] animate-bounce">
                  videocam
                </span>
                <h3 className="text-lg font-semibold text-white">카메라가 아직 꺼져 있습니다.</h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-sm">
                  하단의 '코칭 시작' 버튼을 눌러 카메라 권한을 허용하고 인공지능 자세 추적을 활성화해 주세요.
                </p>
              </div>
            )}

            <video
              ref={videoRef}
              style={{ display: 'none' }}
              playsInline
              muted
            />

            <canvas
              ref={canvasRef}
              className="w-full h-full object-cover rounded-2xl"
            />

            {isRunning && <div className="scan-line"></div>}
          </div>

          <div className="flex gap-4 w-full">
            <button
              onClick={toggleCoaching}
              disabled={isModelLoading}
              className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all duration-300 ${
                isRunning
                  ? 'bg-[var(--accent-rose)] text-white hover:bg-red-600 glow-rose'
                  : 'bg-[var(--accent-neon-green)] text-black hover:bg-green-400 glow-green'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="material-icons-round">
                {isRunning ? 'stop_circle' : 'play_circle'}
              </span>
              {isRunning ? '코칭 중지' : '코칭 시작'}
            </button>
          </div>
        </div>

        {/* Right Side: Performance Dashboard */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Main Status Panel */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent-electric-blue)] opacity-5 blur-3xl rounded-full"></div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold tracking-wider text-[var(--text-secondary)]">CURRENT EXERCISE</span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-widest ${
                squatState === 'WARNING'
                  ? 'bg-red-500 text-white animate-pulse'
                  : squatState === 'DOWN'
                  ? 'bg-[var(--accent-electric-blue)] text-black'
                  : 'bg-[var(--accent-neon-green)] text-black'
              }`}>
                SQUAT : {squatState}
              </span>
            </div>

            {/* Counts Counter */}
            <div className="flex items-baseline gap-2 py-4 border-y border-gray-800">
              <span className="text-7xl font-extrabold tracking-tight text-white">{squatCount}</span>
              <span className="text-lg font-medium text-[var(--text-secondary)]">회 (REPS)</span>
            </div>

            {/* Knee Angle Progress Bar */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">무릎 각도</span>
                <span className="font-semibold text-white">
                  L: {angles.leftKnee.toFixed(0)}° / R: {angles.rightKnee.toFixed(0)}°
                </span>
              </div>
              <div className="w-full bg-[#1b243d] h-4 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    squatState === 'WARNING'
                      ? 'bg-[var(--accent-rose)]'
                      : 'bg-[var(--accent-electric-blue)]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, (180 - (angles.leftKnee + angles.rightKnee) / 2) / 100 * 100))}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                ※ 스쿼트 완료를 위해 무릎 각도가 90도 아래로 충분히 내려가야 합니다.
              </p>
            </div>
          </div>

          {/* AI Coach Voice Feedback Panel */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <h3 className="text-sm font-semibold tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
              <span className="material-icons-round text-base text-[var(--accent-orange)]">psychology</span>
              AI 코치 피드백
            </h3>
            <div className="p-4 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--glass-border)] min-h-[80px] flex items-center">
              <p className={`text-base font-semibold leading-relaxed ${
                squatState === 'WARNING' ? 'text-[var(--accent-rose)]' : 'text-[var(--text-primary)]'
              }`}>
                {feedback}
              </p>
            </div>
          </div>

          {/* Activity Logs Console */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <h3 className="text-sm font-semibold tracking-wider text-[var(--text-secondary)]">실시간 피드백 기록</h3>
            <div className="flex flex-col gap-3 max-h-[160px] overflow-y-auto pr-2">
              {feedbackLogs.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] text-center py-6">로그가 아직 없습니다. 운동을 시작해 보세요.</div>
              ) : (
                feedbackLogs.map(log => (
                  <div key={log.id} className="flex gap-3 text-xs items-start border-b border-gray-900 pb-2">
                    <span className="text-[var(--text-muted)] font-mono">{log.time}</span>
                    <span className={`flex-grow font-medium ${
                      log.type === 'warn'
                        ? 'text-[var(--accent-rose)]'
                        : log.type === 'success'
                        ? 'text-[var(--accent-neon-green)]'
                        : 'text-[var(--text-secondary)]'
                    }`}>
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
