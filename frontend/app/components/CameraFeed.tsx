"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";
import * as faceapi from "@vladmandic/face-api";

interface CameraFeedProps {
  onExpressionDetected: (expression: string, probability: number) => void;
}

const CameraFeed: React.FC<CameraFeedProps> = ({ onExpressionDetected }) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setDeviceId] = useState<string | undefined>(undefined);

  // 1. 카메라 장치 목록 가져오기
  const handleDevices = useCallback(
    (mediaDevices: MediaDeviceInfo[]) => {
      const videoDevices = mediaDevices.filter(({ kind }) => kind === "videoinput");
      setDevices(videoDevices);
      
      // "General Webcam" 또는 외부 웹캠이 있으면 우선 선택, 없으면 첫 번째 장치
      const externalCam = videoDevices.find(d => 
        d.label.toLowerCase().includes("general") || 
        d.label.toLowerCase().includes("webcam") ||
        d.label.toLowerCase().includes("bluetooth")
      );
      
      if (externalCam) {
        setDeviceId(externalCam.deviceId);
      } else if (videoDevices.length > 0) {
        setDeviceId(videoDevices[0].deviceId);
      }
    },
    [setDevices]
  );

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(handleDevices);
  }, [handleDevices]);

  // 다음 카메라로 전환 기능
  const switchCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex(d => d.deviceId === activeDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    setDeviceId(devices[nextIndex].deviceId);
  };

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        console.log("CV Models Loaded");
      } catch (error) {
        console.error("Error loading models:", error);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (modelsLoaded) {
      interval = setInterval(async () => {
        if (
          webcamRef.current &&
          webcamRef.current.video &&
          webcamRef.current.video.readyState === 4
        ) {
          const video = webcamRef.current.video;
          const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceExpressions();

          if (detections.length > 0) {
            const expressions = detections[0].expressions;
            const bestExpression = Object.entries(expressions).reduce((a, b) =>
              a[1] > b[1] ? a : b
            );
            onExpressionDetected(bestExpression[0], bestExpression[1]);

            if (canvasRef.current) {
              const displaySize = {
                width: video.videoWidth,
                height: video.videoHeight,
              };
              faceapi.matchDimensions(canvasRef.current, displaySize);
              const resizedDetections = faceapi.resizeResults(detections, displaySize);
              const ctx = canvasRef.current.getContext("2d");
              if (ctx) {
                ctx.clearRect(0, 0, displaySize.width, displaySize.height);
                faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
                faceapi.draw.drawFaceExpressions(canvasRef.current, resizedDetections);
              }
            }
          }
        }
      }, 200);
    }
    return () => clearInterval(interval);
  }, [modelsLoaded, onExpressionDetected, activeDeviceId]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden rounded-lg border border-gray-800 group">
      {activeDeviceId && (
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ deviceId: activeDeviceId }}
          className="absolute w-full h-full object-cover"
        />
      )}
      <canvas
        ref={canvasRef}
        className="absolute w-full h-full object-cover pointer-events-none"
      />
      {!modelsLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <span className="text-xs text-red-500 animate-pulse font-mono">CV_ENGINE_INITIALIZING...</span>
        </div>
      )}
      
      {/* 카메라 컨트롤 UI */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-3">
        <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-gray-700 backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-[10px] font-black text-green-500 font-mono tracking-tighter uppercase">Live_Feed</span>
        </div>
        
        {devices.length > 1 && (
            <button 
                onClick={switchCamera}
                className="bg-blue-600/80 hover:bg-blue-600 text-white p-1.5 rounded-full transition-all border border-blue-400/50 shadow-lg active:scale-90"
                title="카메라 전환"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            </button>
        )}
      </div>

      {/* 현재 장치 정보 표시 (마우스 호버 시) */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-3 py-1 rounded-md border border-gray-800 pointer-events-none">
        <p className="text-[8px] text-gray-500 font-mono">
            {devices.find(d => d.deviceId === activeDeviceId)?.label || "External Device Detected"}
        </p>
      </div>
    </div>
  );
};

export default CameraFeed;
