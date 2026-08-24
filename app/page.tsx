"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeInfoStore, Theme } from "@/stores/themeInfoStore";
import { useThemeProgressStore, ChatEntry } from "@/stores/themeProgressStore";
import { useRemainingTime } from "@/hooks/useRemainingTime";
import { getSocket } from "@/utils/socketClient";
import { useDebouncedMessage } from "@/hooks/useDebouncedMessage";

export default function Home() {
  const socketRef = useRef<any>(null);
  const { message, showMessage } = useDebouncedMessage(2000);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const { themes, setThemes, getThemes, updateTheme, saveThemes } =
    useThemeInfoStore();
  const {
    themeProgress,
    getProgress,
    initProgressFromThemes,
    startTimer,
    stopTimer,
    resetTimer,
    updateProgress,
    loadProgressFromServer,
    setNewChat,
  } = useThemeProgressStore();

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const selectedCodeRef = useRef<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    { themeCode: string; isConnected: boolean }[]
  >([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("/chat.mp3");
    audioRef.current.load();
  }, []);

  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((e) => console.warn("사운드 재생 실패", e));
    }
  };

  const [onConfirm, setOnConfirm] = useState<() => void>(() => () => {});

  const updateConnectionStatus = (themeCode: string, isConnected: boolean) => {
    setConnectionStatus((prev) =>
      prev.map((item) =>
        item.themeCode === themeCode ? { ...item, isConnected } : item
      )
    );
  };

  useEffect(() => {
    const loadThemes = async () => {
      const res = await fetch("/api/theme");
      const data = await res.json();
      setThemes(data);
      initProgressFromThemes(data);
      await loadProgressFromServer();
      if (data?.length) {
        setSelectedCode(data[0].themeCode);
      }

      const themes: Theme[] = data;
      const initialStatus = themes.map((theme) => ({
        themeCode: theme.themeCode,
        isConnected: false,
        newChat: false,
      }));

      setConnectionStatus(initialStatus);
    };
    loadThemes();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    socket.emit("register", { type: "control" });

    socket.on("status", ({ themeCode, status, data }) => {
      console.log({ themeCode, status, data });
      if (status == "usedHint") {
        updateProgress(themeCode, { hintCount: data }, false, "");
      } else if (status == "chat") {
        data.sort(
          (
            a: { type: "client" | "server"; data: string; createdAt: string },
            b: { type: "client" | "server"; data: string; createdAt: string }
          ) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        updateProgress(themeCode, { chatData: data }, false, "");
        playSound();
        if (themeCode !== selectedCodeRef.current) {
          setNewChat(themeCode, true);
        }
      } else if (status == "requestSync") {
        const { chatData, hintCount } = data;

        const themeProgress = getProgress();
        const themes = getThemes();

        const currentProgress = themeProgress.find(
          (p) => p.themeCode === themeCode
        );
        const currentTheme = themes.find((p) => p.themeCode === themeCode);

        if (!currentProgress || !currentTheme) return;

        const severChatData = currentProgress.chatData;
        const appCount = severChatData.filter(
          (msg) => msg.type === "client"
        ).length;

        const newAppCount = (
          data.chatData as {
            type: "server" | "client";
            data: string;
            createdAt: string;
          }[]
        ).filter((msg) => msg.type === "client").length;

        if (appCount < newAppCount && themeCode !== selectedCodeRef.current) {
          setNewChat(themeCode, true);
        }
        const mergedChatData = [...severChatData, ...chatData];

        const uniqueChatData = mergedChatData.filter(
          (item: ChatEntry, index: number, self: ChatEntry[]) =>
            index ===
            self.findIndex(
              (t) => t.type === item.type && t.createdAt === item.createdAt
            )
        );

        uniqueChatData.sort(
          (
            a: { type: "client" | "server"; data: string; createdAt: string },
            b: { type: "client" | "server"; data: string; createdAt: string }
          ) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        updateProgress(
          themeCode,
          { chatData: uniqueChatData, hintCount: hintCount },
          false,
          ""
        );

        const isRunning = currentProgress.isRunning;
        const remainingTime =
          isRunning === 2
            ? currentProgress.endTime
            : currentProgress.endTime - Date.now();
        const progress = currentTheme.progress[currentProgress.progressIndex];
        console.log(
          {
            chatData: uniqueChatData,
            progress,
            remainingTime,
            isRunning,
          },
          themeCode
        );
        sendToHintApp(
          "doSync",
          {
            chatData: uniqueChatData,
            progress,
            remainingTime,
            isRunning,
          },
          themeCode
        );
      } else if (status === "completeSync") {
        const themes = getThemes();
        const Theme = themes.find((p) => p.themeCode === themeCode);
        if (Theme) {
          showMessage(`${Theme.themeTitle} ${data} 동기화 완료`);
        }
      } else if (status === "appDisconnected") {
        const themes = getThemes();
        const Theme = themes.find((p) => p.themeCode === themeCode);
        updateConnectionStatus(themeCode, false);
        if (Theme) {
          showMessage(`${Theme.themeTitle} 연결 종료`);
        }
      } else if (status === "appConnected") {
        const themes = getThemes();
        const Theme = themes.find((p) => p.themeCode === themeCode);
        updateConnectionStatus(themeCode, true);
        if (Theme) {
          showMessage(`${Theme.themeTitle} 연결`);
        }
      } else if (status === "initialAppConnections") {
        setTimeout(() => {
          data.forEach((themeCode: any) => {
            updateConnectionStatus(themeCode.themeCode, true);
          });
        }, 1000);
      } else if (status === "changeSetting") {
        updateTheme(themeCode, data);
        saveThemes();
      } else if (status === "reset") {
        resetTimer(themeCode);
      } else if (status === "requestStart") {
        console.log("리퀘스트스타트");
        handleStartByApp(themeCode);
      }
    });

    setTimeout(() => {
      let themes = getThemes();
      themes.forEach((d) => {
        sendToHintApp("requestSync", {}, d.themeCode);
      });
    }, 1000);
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const currentProgress = themeProgress.find(
      (p) => p.themeCode === selectedCode
    );
    if (chatScrollRef.current && currentProgress?.chatData) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [themeProgress, selectedCode]);

  const selectedTheme = themes.find((t) => t.themeCode === selectedCode);
  const selectedProgress = themeProgress.find(
    (p) => p.themeCode === selectedCode
  );

  useEffect(() => {
    selectedCodeRef.current = selectedCode;
    if (selectedCode) {
      setNewChat(selectedCode, false);
    }
  }, [selectedCode]);

  const { label: timeLabel, isOver } = useRemainingTime(
    selectedProgress?.endTime ?? 0,
    selectedProgress?.isRunning ?? 0
  );

  const sendToHintApp = (command: string, data: object, themeCode?: string) => {
    console.log({ command, data, themeCode });
    socketRef.current?.emit("toApp", {
      themeCode: themeCode || selectedCode,
      command,
      data,
    });
  };

  const handleStart = () => {
    if (!selectedTheme || !selectedCode) return;
    const currentProgress = themeProgress.find(
      (p) => p.themeCode === selectedCode
    );
    const ms =
      currentProgress?.isRunning === 2
        ? currentProgress.endTime
        : (selectedTheme.durationMinutes * 60 + selectedTheme.durationSeconds) *
          1000;

    const calculTime = startTimer(selectedCode, ms);
    sendToHintApp("startTimer", { remainingTime: calculTime });
  };

  const handleStartByApp = (themeCode: string) => {
    if (!themeCode) return;
    const latestThemes = getThemes();
    const latestProgress = getProgress();

    const selectedTheme = latestThemes.find((t) => t.themeCode === themeCode);
    if (!selectedTheme) return;

    const currentProgress = latestProgress.find(
      (p) => p.themeCode === themeCode
    );

    if (currentProgress?.isRunning !== 0) return;

    const ms =
      (selectedTheme.durationMinutes * 60 + selectedTheme.durationSeconds) *
      1000;

    const calculTime = startTimer(themeCode, ms);

    sendToHintApp("startTimer", { remainingTime: calculTime }, themeCode);
  };

  const handleStop = () => {
    if (!selectedCode) return;
    stopTimer(selectedCode);
    sendToHintApp("stopTimer", {});
  };

  const handleReset = () => {
    if (!selectedCode || !selectedTheme) return;
    setModalMessage(
      `${selectedTheme.themeTitle}의 진행 데이터가 초기화 됩니다. 정말 초기화 하시겠습니까?`
    );
    setOnConfirm(() => () => {
      resetTimer(selectedCode);
      sendToHintApp("reset", {});
      setShowModal(false);
    });
    setShowModal(true);
  };

  const adjustTime = (deltaMs: number) => {
    if (!selectedCode) return;
    const current = themeProgress.find((p) => p.themeCode === selectedCode);
    if (!current) return;

    const newEndTime = current.endTime + deltaMs;
    const remainingTime = newEndTime - Date.now();
    const isRunning = current.isRunning;

    updateProgress(
      selectedCode,
      { endTime: newEndTime, isRunning },
      true,
      "changeTime",
      undefined,
      current.isRunning == 2 ? newEndTime : remainingTime
    );
  };

  const adjustProgressIndex = (delta: number) => {
    if (!selectedCode || !selectedProgress || !selectedTheme) return;
    const maxIndex = selectedTheme.progress.length - 1;
    const newIndex = Math.max(
      0,
      Math.min(maxIndex, selectedProgress.progressIndex + delta)
    );
    updateProgress(
      selectedCode,
      { progressIndex: newIndex },
      true,
      "changeProgress",
      selectedTheme.progress[newIndex]
    );
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || !selectedCode) return;
    const current = themeProgress.find((p) => p.themeCode === selectedCode);
    if (!current) return;
    const newChat = [
      ...(current.chatData || []),
      {
        type: "server" as const,
        data: chatInput,
        createdAt: new Date().toISOString(),
      },
    ];
    updateProgress(selectedCode, { chatData: newChat }, true, "changeChat");
    setChatInput("");
  };

  const renderTimeDisplay = () => {
    if (!selectedProgress || !selectedTheme) return null;
    if (selectedProgress.isRunning === 1 || selectedProgress.isRunning === 2)
      return timeLabel;
    return `${String(selectedTheme.durationMinutes).padStart(2, "0")}:${String(
      selectedTheme.durationSeconds
    ).padStart(2, "0")}`;
  };

  const timerColor =
    selectedProgress?.isRunning === 1
      ? isOver
        ? "text-red-600"
        : "text-blue-600"
      : "text-black";

  const formatKST = (isoString: string) =>
    new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(new Date(isoString));

  // ====================== 오른쪽 사이드바(모든 테마 남은시간) ======================
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const formatMsToMMSS = (ms: number) => {
    const neg = ms < 0;
    const abs = Math.abs(ms);
    const m = Math.floor(abs / 60000);
    const s = Math.floor((abs % 60000) / 1000);
    const str = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return neg ? `-${str}` : str;
  };

  const getThemeRemaining = (t: Theme) => {
    const prog = themeProgress.find((p) => p.themeCode === t.themeCode);
    if (!prog || prog.isRunning === 0) {
      const initMs = (t.durationMinutes * 60 + t.durationSeconds) * 1000;
      return formatMsToMMSS(initMs);
    }
    if (prog.isRunning === 2) {
      return formatMsToMMSS(prog.endTime);
    }
    const remain = prog.endTime - Date.now();
    return formatMsToMMSS(remain);
  };
  // ============================================================================

  return (
    <div className="p-6 flex flex-col gap-6 w-full max-w-screen-xl mx-auto">
      {/* 상단 테마 버튼들 */}
      <div className="flex flex-wrap gap-2">
        {themes.map((t) => {
          const isSelected = selectedCode === t.themeCode;
          const runningStatus = themeProgress.find(
            (p) => p.themeCode === t.themeCode
          )?.isRunning;

          const status = connectionStatus.find(
            (c) => c.themeCode === t.themeCode
          );
          const isConnected = status?.isConnected;
          const hasNewChat = themeProgress.find(
            (p) => p.themeCode === t.themeCode
          )?.newChat;

          let className =
            "px-4 py-2 rounded cursor-pointer transition " +
            (isConnected ? "opacity-100 " : "opacity-20 ") +
            (hasNewChat ? "animate-blink " : "");

          if (runningStatus === 1 && isSelected) {
            className += "bg-green-700 text-white";
          } else if (runningStatus === 1) {
            className += "bg-green-200 text-black";
          } else if (runningStatus === 2 && isSelected) {
            className += "bg-red-700 text-white";
          } else if (runningStatus === 2) {
            className += "bg-red-300 text-black";
          } else if (isSelected) {
            className += "bg-black text-white";
          } else {
            className += "bg-gray-200 hover:bg-gray-300 text-black";
          }

          return (
            <button
              key={t.themeCode}
              onClick={() => setSelectedCode(t.themeCode)}
              className={className}
            >
              {t.themeTitle}
            </button>
          );
        })}
      </div>

      <div className="flex gap-4 w-full">
        {/* 좌측: 선택된 테마 정보 / 타이머 */}
        {selectedTheme && selectedProgress && (
          <div className="w-[40%] min-w-[300px] p-4 border rounded bg-white shadow">
            <h2 className="text-4xl font-bold mb-3">
              {selectedTheme.themeTitle}
            </h2>

            <p className="text-sm mb-1">
              <strong>제한 시간:</strong> {selectedTheme.durationMinutes}분{" "}
              {selectedTheme.durationSeconds}초
            </p>
            <p className="text-sm mb-1">
              <strong>사용힌트 수:</strong> {selectedProgress.hintCount}
            </p>
            <p className="text-sm mb-1">
              <strong>현재상태:</strong>{" "}
              {selectedProgress.isRunning === 1
                ? "진행 중"
                : selectedProgress.isRunning === 2
                ? "일시정지"
                : "대기 중"}
            </p>
            <p className="text-sm mb-3">
              <strong>현재 진행률:</strong>{" "}
              {selectedTheme.progress[selectedProgress.progressIndex] + "%"}
            </p>

            <p className={`text-7xl font-mono text-center my-2 ${timerColor}`}>
              {renderTimeDisplay()}
            </p>

            <div className="mt-3 flex gap-2">
              {selectedProgress.isRunning === 1 ? (
                <button
                  className="flex-1 bg-gray-600 text-white rounded py-2 hover:opacity-90 cursor-pointer"
                  onClick={handleStop}
                >
                  정지
                </button>
              ) : (
                <button
                  className="flex-1 bg-green-600 text-white rounded py-2 hover:opacity-90 cursor-pointer"
                  onClick={handleStart}
                >
                  스타트
                </button>
              )}
              <button
                className="flex-1 bg-red-600 text-white rounded py-2 hover:opacity-90 cursor-pointer"
                onClick={handleReset}
              >
                초기화
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1 text-sm">
              <button
                className="flex-1 bg-blue-100 py-1 rounded hover:bg-blue-200 cursor-pointer"
                onClick={() => adjustTime(-10 * 60 * 1000)}
              >
                -10분
              </button>
              <button
                className="flex-1 bg-blue-100 py-1 rounded hover:bg-blue-200 cursor-pointer"
                onClick={() => adjustTime(-1 * 60 * 1000)}
              >
                -1분
              </button>
              <button
                className="flex-1 bg-blue-100 py-1 rounded hover:bg-blue-200 cursor-pointer"
                onClick={() => adjustTime(1 * 60 * 1000)}
              >
                +1분
              </button>
              <button
                className="flex-1 bg-blue-100 py-1 rounded hover:bg-blue-200 cursor-pointer"
                onClick={() => adjustTime(10 * 60 * 1000)}
              >
                +10분
              </button>
            </div>

            <div className="mt-3 flex gap-1 text-sm">
              <button
                className="flex-1 bg-yellow-200 py-1 rounded hover:bg-yellow-300 cursor-pointer"
                onClick={() => adjustProgressIndex(-1)}
              >
                진행률 -1
              </button>
              <button
                className="flex-1 bg-yellow-200 py-1 rounded hover:bg-yellow-300 cursor-pointer"
                onClick={() => adjustProgressIndex(1)}
              >
                진행률 +1
              </button>
            </div>

            <div className="mt-3">
              <button
                className="w-full bg-sky-500 text-white py-2 rounded hover:bg-sky-600 transition-colors duration-200 shadow-md font-semibold cursor-pointer"
                onClick={() => sendToHintApp("requestSync", {})}
              >
                동기화
              </button>
            </div>
            {selectedTheme.lightOffTime > 0 && (
              <div className="mt-3">
                <button
                  className="w-full bg-black text-white py-2 rounded hover:bg-gray-800 cursor-pointer"
                  onClick={() =>
                    sendToHintApp("lightOff", {
                      themeCode: selectedCode,
                      lightOffTime: selectedTheme.lightOffTime,
                    })
                  }
                >
                  라이트 암전
                </button>
              </div>
            )}
          </div>
        )}

        {/* 가운데: 채팅창 */}
        <div className="w-[35%] min-w-[280px] p-4 border rounded bg-white shadow h-[500px] flex flex-col">
          <div
            className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1"
            ref={chatScrollRef}
          >
            {(selectedProgress?.chatData || []).map((chat, idx) => {
              const isServer = chat.type === "server";
              const timeLabel = formatKST(chat.createdAt);
              return (
                <div
                  key={idx}
                  className={`flex ${
                    isServer ? "justify-end" : "justify-start"
                  }`}
                >
                  {isServer && (
                    <span className="text-xs text-gray-500 self-end mr-2">
                      {timeLabel}
                    </span>
                  )}
                  <div
                    className={`px-3 py-2 rounded text-sm max-w-[70%] ${
                      isServer
                        ? "bg-yellow-300 text-black"
                        : "bg-white text-black border"
                    }`}
                  >
                    {chat.data}
                  </div>
                  {!isServer && (
                    <span className="text-xs text-gray-500 self-end ml-2">
                      {timeLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-2">
            <input
              className="w-full border px-3 py-2 rounded text-sm"
              placeholder="채팅 입력 후 Enter"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendChat();
              }}
            />
          </div>
        </div>

        {/* 오른쪽: 모든 테마 남은시간 + 연결 상태 */}
        <div className="w-[25%] min-w-[220px] p-4 border rounded bg-white shadow h-[500px] overflow-y-auto">
          <h3 className="text-lg font-semibold mb-3">모든 테마 남은시간</h3>
          <ul className="space-y-2">
            {themes.map((t) => {
              const isSel = t.themeCode === selectedCode;
              const remain = getThemeRemaining(t);
              const prog = themeProgress.find(
                (p) => p.themeCode === t.themeCode
              );
              const status = prog?.isRunning;
              const isOver =
                status === 1 ? (prog?.endTime || 0) - Date.now() < 0 : false;

              const conn = connectionStatus.find(
                (c) => c.themeCode === t.themeCode
              );
              const isConn = conn?.isConnected;

              return (
                <li
                  key={t.themeCode + tick}
                  className={`flex items-center rounded px-3 py-2 border ${
                    isSel ? "bg-gray-100 border-gray-400" : "border-gray-200"
                  }`}
                >
                  {/* 왼쪽: 테마 이름 */}
                  <span className="flex-1 truncate mr-2">{t.themeTitle}</span>

                  {/* 가운데: 시간 */}
                  <span
                    className={`flex-1 text-center font-mono text-sm ${
                      isOver ? "text-red-600" : "text-gray-800"
                    }`}
                    title={t.themeCode}
                  >
                    {remain}
                  </span>

                  {/* 오른쪽: ON / OFF */}
                  <span
                    className={`flex-1 text-right text-sm font-extrabold tracking-[0.2em] ${
                      isConn ? "text-blue-600" : "text-red-600"
                    }`}
                  >
                    {isConn ? "ON" : "OFF"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {message && (
        <div className="fixed top-6 right-6 z-50 pointer-events-none">
          <div
            className="text-white px-6 py-3 rounded-xl shadow-lg text-lg font-semibold pointer-events-auto backdrop-blur-sm"
            style={{ backgroundColor: "rgba(22, 163, 74, 0.5)" }}
          >
            {message}
          </div>
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
        >
          <div className="bg-white p-6 rounded shadow-lg text-center w-[90%] max-w-md">
            <p className="mb-4 text-black">{modalMessage}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => onConfirm()}
                className="bg-red-600 text-white px-4 py-2 rounded hover:opacity-90 cursor-pointer"
              >
                확인
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400 cursor-pointer"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }
        .animate-blink {
          animation: blink 1s infinite;
        }
      `}</style>
    </div>
  );
}
