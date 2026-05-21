"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";

let faceapi: any;

interface CameraFeedProps {
  onExpressionDetected: (expression: string, probability: number, gazeScore: number) => void;
}

const CameraFeed: React.FC<CameraFeedProps> = ({ onExpressionDetected }) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [isClient, setIsClient] = useState(false);
  
  const gazePoints = useRef<{x: number, y: number, t: number}[]>([]);

  const refreshDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = mediaDevices.filter(({ kind }) => kind === "videoinput");
      setDevices(videoDevices);
      if (videoDevices.length > 0) {
        const externalCam = videoDevices.find(d => 
          d.label.toLowerCase().includes("general") || 
          d.label.toLowerCase().includes("webcam") ||
          d.label.toLowerCase().includes("bluetooth")
        );
        setDeviceId(prev => prev || (externalCam ? externalCam.deviceId : videoDevices[0].deviceId));
      }
    } catch (err) {}
  }, []);

  useEffect(() => {
    setIsClient(true);
    const init = async () => {
      try {
        faceapi = await import("@vladmandic/face-api");
        const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (e) {}
      refreshDevices();
    };
    init();
  }, [refreshDevices]);

  const drawHeatmap = useCallback(() => {
    const ctx = heatmapCanvasRef.current?.getContext("2d");
    if (!ctx || !heatmapCanvasRef.current) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const now = Date.now();
    
    gazePoints.current = gazePoints.current.filter(p => now - p.t < 3000);

    gazePoints.current.forEach(p => {
      const age = now - p.t;
      const alpha = Math.max(0, 1 - age / 3000);
      
      // 컬러 화면에서 더 잘 보이는 비비드한 오렌지/레드 그라데이션
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
      gradient.addColorStop(0, `rgba(255, 45, 0, ${alpha * 0.6})`);
      gradient.addColorStop(1, 'rgba(255, 45, 0, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (modelsLoaded && faceapi && isClient) {
      interval = setInterval(async () => {
        if (webcamRef.current?.video?.readyState === 4) {
          const video = webcamRef.current.video;
          try {
            const detections = await faceapi
              .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
              .withFaceLandmarks()
              .withFaceExpressions();

            if (detections?.length > 0) {
              const detection = detections[0];
              const expressions = detection.expressions;
              const landmarks = detection.landmarks;
              
              const jaw = landmarks.getJawOutline();
              const faceWidth = Math.abs(jaw[16].x - jaw[0].x);
              const faceCenter = (jaw[16].x + jaw[0].x) / 2;
              const nose = landmarks.getNose();
              const deviationX = (nose[6].x - faceCenter) / faceWidth;
              const focusScore = Math.max(0, 1 - (Math.abs(deviationX) * 2.5));
              
              if (heatmapCanvasRef.current) {
                const displaySize = { width: video.videoWidth, height: video.videoHeight };
                const resized = faceapi.resizeResults(detection, displaySize);
                const noseTip = resized.landmarks.getNose()[6];
                gazePoints.current.push({ x: noseTip.x, y: noseTip.y, t: Date.now() });
                drawHeatmap();
              }

              const bestExpression = Object.entries(expressions).reduce((a: any, b: any) =>
                a[1] > b[1] ? a : b
              )as [string, number];
              
              onExpressionDetected(bestExpression[0], bestExpression[1], focusScore);

              if (canvasRef.current) {
                const displaySize = { width: video.videoWidth, height: video.videoHeight };
                faceapi.matchDimensions(canvasRef.current, displaySize);
                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                const ctx = canvasRef.current.getContext("2d");
                if (ctx) {
                  ctx.clearRect(0, 0, displaySize.width, displaySize.height);
                  // 사이버네틱 랜드마크 스타일 (전기 푸른색 점)
                  resizedDetections.forEach((det: any) => {
                    const points = det.landmarks.positions;
                    ctx.fillStyle = "#00f2ff";
                    points.forEach((p: any) => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
                        ctx.fill();
                    });
                  });
                }
              }
            }
          } catch (e) {}
        }
      }, 100); 
    }
    return () => clearInterval(interval);
  }, [modelsLoaded, onExpressionDetected, activeDeviceId, isClient, drawHeatmap]);

  if (!isClient) return <div className="w-full h-full bg-gray-900" />;

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden rounded-lg border border-gray-800 group">
      {/* 흑백 필터 제거, 선명한 컬러 피드 */}
      {activeDeviceId && (
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ deviceId: activeDeviceId }}
          className="absolute w-full h-full object-cover"
        />
      )}
      
      {/* HUD 장식용 그리드 레이어 */}
      <div className="absolute inset-0 pointer-events-none opacity-20 border-[20px] border-transparent shadow-[inset_0_0_100px_rgba(0,242,255,0.2)]"></div>
      <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-cyan-400 opacity-50"></div>
      <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-cyan-400 opacity-50"></div>
      <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-cyan-400 opacity-50"></div>
      <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-cyan-400 opacity-50"></div>

      {/* 히트맵 */}
      <canvas 
        ref={heatmapCanvasRef} 
        width={640} 
        height={480} 
        className="absolute w-full h-full object-cover pointer-events-none opacity-70 mix-blend-hard-light" 
      />
      
      {/* 랜드마크 */}
      <canvas ref={canvasRef} className="absolute w-full h-full object-cover pointer-events-none" />
      
      {!modelsLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] text-cyan-500 font-mono tracking-widest uppercase italic">Initializing_Multimodal_Engine...</span>
          </div>
        </div>
      )}
      
      {/* 분석 하단 바 */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-gray-700 backdrop-blur-md">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(0,242,255,1)]"></div>
                <span className="text-[10px] font-black text-cyan-400 font-mono tracking-tighter uppercase">Scanning_Active</span>
            </div>
            <button onClick={() => { gazePoints.current = []; }} className="bg-black/40 hover:bg-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-full text-[8px] font-black uppercase transition-all border border-white/10 backdrop-blur-sm">Reset Gaze</button>
        </div>
        
        <div className="bg-black/60 px-3 py-1.5 rounded-md border border-gray-800 backdrop-blur-sm hidden group-hover:block">
            <p className="text-[8px] text-cyan-400 font-mono">
                {devices.find(d => d.deviceId === activeDeviceId)?.label || "Precision Lens"}
            </p>
        </div>
      </div>
    </div>
  );
};

export default CameraFeed;
