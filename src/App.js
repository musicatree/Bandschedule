import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";
import {
  Music,
  Calendar,
  Clock,
  Users,
  Share2,
  Sparkles,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Check,
  Copy,
  Zap,
  Plus,
  ArrowRight,
  UserPlus,
  Settings,
  LogIn,
  Link as LinkIcon,
  ChevronRight,
  Award,
  RefreshCw,
} from "lucide-react";

// ==========================================
// 1. FIREBASE INITIALIZATION & HELPER SETUP
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAhqU06KBOeSzxen2iN9WkPfn_RSLOzD4U",
  authDomain: "band-schedule-7a9d5.firebaseapp.com",
  projectId: "band-schedule-7a9d5",
  storageBucket: "band-schedule-7a9d5.firebasestorage.app",
  messagingSenderId: "198190012165",
  appId: "1:198190012165:web:a2b8e5307d2bd9172c896c",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId =
  typeof __app_id !== "undefined" ? __app_id : "band-rehearsal-sync-v2";

// Standard Band Roles
const BAND_ROLES = [
  { id: "vocal", label: "🎙️ 보컬", isRhythm: false },
  { id: "guitar", label: "🎸 기타", isRhythm: false },
  { id: "bass", label: "🎸 베이스", isRhythm: true },
  { id: "drums", label: "🥁 드럼", isRhythm: true },
  { id: "keyboard", label: "🎹 건반", isRhythm: false },
  { id: "brass", label: "🎷 섹션/관현악", isRhythm: false },
  { id: "other", label: "🎵 기타/스태프", isRhythm: false },
];

// Date Generator Helper
const generateDateRange = (startDateStr, endDateStr) => {
  const dates = [];
  let curr = new Date(startDateStr);
  const end = new Date(endDateStr);

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

  while (curr <= end) {
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, "0");
    const dd = String(curr.getDate()).padStart(2, "0");
    const id = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = curr.getDay();

    dates.push({
      id,
      monthNum: curr.getMonth() + 1,
      dateNum: dd,
      dayName: dayNames[dayOfWeek],
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });

    curr.setDate(curr.getDate() + 1);
  }
  return dates;
};

// Default Date Utility (Today to 2 weeks later)
const getTodayStr = () => new Date().toISOString().split("T")[0];
const getFutureDateStr = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0];
};

// Generate Short Room ID
const generateRoomId = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "band-";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function App() {
  // Auth & Routing State
  const [user, setUser] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [currentView, setCurrentView] = useState("home"); // 'home' | 'join' | 'main'

  // Room Form State (Create Room)
  const [createBandName, setCreateBandName] = useState("");
  const [createStartDate, setCreateStartDate] = useState(getTodayStr());
  const [createEndDate, setCreateEndDate] = useState(getFutureDateStr(14)); // 2 weeks default
  const [createStartHour, setCreateStartHour] = useState(10);
  const [createEndHour, setCreateEndHour] = useState(23);

  // User Identity in Current Room
  const [myMemberId, setMyMemberId] = useState("");
  const [userNameInput, setUserNameInput] = useState("");
  const [userRoleInput, setUserRoleInput] = useState("vocal");

  // Live Room Data from Firestore
  const [roomData, setRoomData] = useState(null);
  const [selectedDateId, setSelectedDateId] = useState("");
  const [activeTab, setActiveTab] = useState("vote"); // 'vote' | 'best' | 'members'

  // Range Selection Mode State
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [rangeStartHour, setRangeStartHour] = useState(null);

  // UI Utilities
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ----------------------------------------------------
  // 1. FIREBASE AUTH INITIALIZATION
  // ----------------------------------------------------
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // ----------------------------------------------------
  // 2. CHECK URL HASH FOR DIRECT ROOM LINK
  // ----------------------------------------------------
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith("#room=")) {
        const targetRoom = hash.replace("#room=", "").trim();
        if (targetRoom) {
          setRoomId(targetRoom);
          // Check local storage for existing session in this room
          const savedMemberId = localStorage.getItem(
            `rehearsal_member_${targetRoom}`
          );
          if (savedMemberId) {
            setMyMemberId(savedMemberId);
          }
        }
      }
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  // ----------------------------------------------------
  // 3. FIRESTORE REAL-TIME ROOM SNAPSHOT LISTENER
  // ----------------------------------------------------
  useEffect(() => {
    if (!user || !roomId) return;

    // RULE 1 Path: /artifacts/{appId}/public/data/rehearsalRooms/{roomId}
    const roomRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "rehearsalRooms",
      roomId
    );

    const unsubscribe = onSnapshot(
      roomRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRoomData(data);

          // Auto set initial selected date if not set
          if (!selectedDateId && data.startDate) {
            setSelectedDateId(data.startDate);
          }

          // Route to appropriate view
          const storedMemberId = localStorage.getItem(
            `rehearsal_member_${roomId}`
          );
          if (storedMemberId && data.members && data.members[storedMemberId]) {
            setMyMemberId(storedMemberId);
            setCurrentView("main");
          } else {
            setCurrentView("join");
          }
        } else {
          // Room does not exist yet
          if (currentView !== "home") {
            setCurrentView("home");
          }
        }
      },
      (err) => {
        console.error("Firestore onSnapshot error:", err);
      }
    );

    return () => unsubscribe();
  }, [user, roomId]);

  // Reset range mode when date changes
  useEffect(() => {
    setRangeStartHour(null);
  }, [selectedDateId]);

  // Derived Dates List & Hours
  const roomDates = useMemo(() => {
    if (!roomData?.startDate || !roomData?.endDate) return [];
    return generateDateRange(roomData.startDate, roomData.endDate);
  }, [roomData]);

  const roomHours = useMemo(() => {
    if (!roomData) return [];
    const start = roomData.startHour || 10;
    const end = roomData.endHour || 23;
    const hours = [];
    for (let h = start; h < end; h++) {
      hours.push({
        hour: h,
        label: `${String(h).padStart(2, "0")}:00 - ${String(h + 1).padStart(
          2,
          "0"
        )}:00`,
        tag: h < 12 ? "오전" : h < 18 ? "오후" : h < 22 ? "저녁" : "야간",
      });
    }
    return hours;
  }, [roomData]);

  // ----------------------------------------------------
  // 4. ACTION HANDLERS (Create Room, Join Room, Vote)
  // ----------------------------------------------------
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!createBandName.trim() || !user) return;

    setIsSubmitting(true);
    const newRoomId = generateRoomId();

    const newRoomPayload = {
      roomId: newRoomId,
      bandName: createBandName.trim(),
      startDate: createStartDate,
      endDate: createEndDate,
      startHour: parseInt(createStartHour),
      endHour: parseInt(createEndHour),
      createdAt: new Date().toISOString(),
      members: {},
      votes: {},
    };

    try {
      const roomRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "rehearsalRooms",
        newRoomId
      );
      await setDoc(roomRef, newRoomPayload);

      setRoomId(newRoomId);
      window.location.hash = `#room=${newRoomId}`;
      setSelectedDateId(createStartDate);
      setCurrentView("join");
    } catch (err) {
      console.error("Create room error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!userNameInput.trim() || !user || !roomId || !roomData) return;

    setIsSubmitting(true);
    const memberId = "m_" + Math.random().toString(36).substr(2, 7);
    const roleObj =
      BAND_ROLES.find((r) => r.id === userRoleInput) || BAND_ROLES[0];

    const updatedMembers = {
      ...(roomData.members || {}),
      [memberId]: {
        id: memberId,
        name: userNameInput.trim(),
        roleId: userRoleInput,
        roleLabel: roleObj.label,
        isRhythm: roleObj.isRhythm,
        joinedAt: new Date().toISOString(),
      },
    };

    try {
      const roomRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "rehearsalRooms",
        roomId
      );
      await setDoc(roomRef, { members: updatedMembers }, { merge: true });

      localStorage.setItem(`rehearsal_member_${roomId}`, memberId);
      setMyMemberId(memberId);
      setCurrentView("main");
    } catch (err) {
      console.error("Join room error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSlotStatus = async (dateId, hour) => {
    if (!user || !roomId || !myMemberId || !roomData) return;

    const currentVotes = roomData.votes || {};
    const dateVotes = currentVotes[dateId] ? { ...currentVotes[dateId] } : {};
    const hourVotes = dateVotes[hour] ? { ...dateVotes[hour] } : {};
    const currentMyStatus = hourVotes[myMemberId] || "unavailable";

    // Cycle: available -> if_need_be -> unavailable -> available
    let nextStatus = "available";
    if (currentMyStatus === "available") nextStatus = "if_need_be";
    else if (currentMyStatus === "if_need_be") nextStatus = "unavailable";

    if (isRangeMode) {
      if (rangeStartHour === null) {
        // 첫 번째 탭: 시작 시간 지정
        setRangeStartHour(hour);
        return;
      } else {
        // 두 번째 탭: 종료 시간 지정 및 사이 영역 채우기
        const start = Math.min(rangeStartHour, hour);
        const end = Math.max(rangeStartHour, hour);

        // 시작 시간의 원래 상태를 기준으로 사이클 진행
        const startStatusBefore =
          (dateVotes[rangeStartHour] || {})[myMemberId] || "unavailable";
        let applyStatus = "available";
        if (startStatusBefore === "available") applyStatus = "if_need_be";
        else if (startStatusBefore === "if_need_be")
          applyStatus = "unavailable";

        const updatedDateVotes = { ...dateVotes };
        for (let h = start; h <= end; h++) {
          const hVotes = updatedDateVotes[h] ? { ...updatedDateVotes[h] } : {};
          hVotes[myMemberId] = applyStatus;
          updatedDateVotes[h] = hVotes;
        }

        const updatedVotes = {
          ...currentVotes,
          [dateId]: updatedDateVotes,
        };

        try {
          const roomRef = doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "rehearsalRooms",
            roomId
          );
          await setDoc(roomRef, { votes: updatedVotes }, { merge: true });
        } catch (err) {
          console.error("Range fill error:", err);
        }

        // 연속 선택 모드 종료
        setRangeStartHour(null);
        setIsRangeMode(false);
        return;
      }
    }

    // 단일 탭 처리
    const updatedDateVotes = {
      ...dateVotes,
      [hour]: {
        ...hourVotes,
        [myMemberId]: nextStatus,
      },
    };

    const updatedVotes = {
      ...currentVotes,
      [dateId]: updatedDateVotes,
    };

    try {
      const roomRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "rehearsalRooms",
        roomId
      );
      await setDoc(roomRef, { votes: updatedVotes }, { merge: true });
    } catch (err) {
      console.error("Toggle slot error:", err);
    }
  };

  const handleQuickPresetFill = async (presetType) => {
    if (!user || !roomId || !myMemberId || !roomData || !selectedDateId) return;

    const currentVotes = { ...(roomData.votes || {}) };
    const dateVotes = { ...(currentVotes[selectedDateId] || {}) };

    roomHours.forEach((slot) => {
      const h = slot.hour;
      const hourVotes = { ...(dateVotes[h] || {}) };

      if (presetType === "evening") {
        hourVotes[myMemberId] =
          h >= 18 && h <= 22 ? "available" : "unavailable";
      } else if (presetType === "all") {
        hourVotes[myMemberId] = "available";
      } else if (presetType === "clear") {
        hourVotes[myMemberId] = "unavailable";
      }
      dateVotes[h] = hourVotes;
    });

    currentVotes[selectedDateId] = dateVotes;

    try {
      const roomRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "rehearsalRooms",
        roomId
      );
      await setDoc(roomRef, { votes: currentVotes }, { merge: true });
    } catch (err) {
      console.error("Preset fill error:", err);
    }
  };

  const handleCopyShareLink = () => {
    const fullUrl = `${window.location.origin}${window.location.pathname}#room=${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleLeaveRoom = () => {
    if (roomId) {
      localStorage.removeItem(`rehearsal_member_${roomId}`);
    }
    setMyMemberId("");
    setCurrentView("join");
  };

  // ----------------------------------------------------
  // 5. CALCULATE BEST CONTINUOUS REHEARSAL SLOTS (TOP 5)
  // ----------------------------------------------------
  const bestRehearsalSlots = useMemo(() => {
    if (
      !roomData ||
      !roomData.members ||
      roomDates.length === 0 ||
      roomHours.length === 0
    )
      return [];

    const membersList = Object.values(roomData.members);
    if (membersList.length === 0) return [];

    const votes = roomData.votes || {};
    const candidateBlocks = [];

    // Check 2-hour blocks across all dates
    roomDates.forEach((day) => {
      const dayVotes = votes[day.id] || {};

      for (let i = 0; i < roomHours.length - 1; i++) {
        const h1 = roomHours[i].hour;
        const h2 = roomHours[i + 1].hour;

        const v1 = dayVotes[h1] || {};
        const v2 = dayVotes[h2] || {};

        let totalAvailableCount = 0;
        let drumAvailable = false;
        let bassAvailable = false;

        const memberBreakdown = membersList.map((m) => {
          const s1 = v1[m.id] || "unavailable";
          const s2 = v2[m.id] || "unavailable";

          let combined = "unavailable";
          if (s1 === "available" && s2 === "available") combined = "available";
          else if (
            (s1 === "available" || s1 === "if_need_be") &&
            (s2 === "available" || s2 === "if_need_be")
          )
            combined = "if_need_be";

          if (combined === "available") {
            totalAvailableCount++;
            if (m.roleId === "drums") drumAvailable = true;
            if (m.roleId === "bass") bassAvailable = true;
          } else if (combined === "if_need_be") {
            if (m.roleId === "drums") drumAvailable = true;
            if (m.roleId === "bass") bassAvailable = true;
          }

          return { ...m, status: combined };
        });

        const isRhythmComplete = drumAvailable && bassAvailable;
        const score = totalAvailableCount * 10 + (isRhythmComplete ? 15 : 0);

        candidateBlocks.push({
          dateId: day.id,
          monthNum: day.monthNum,
          dateNum: day.dateNum,
          dayName: day.dayName,
          timeLabel: `${String(h1).padStart(2, "0")}:00 - ${String(
            h2 + 1
          ).padStart(2, "0")}:00 (2시간)`,
          availableCount: totalAvailableCount,
          totalMembers: membersList.length,
          memberBreakdown,
          isRhythmComplete,
          score,
        });
      }
    });

    return candidateBlocks.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [roomData, roomDates, roomHours]);

  // Helper for counting user's marked available hours for a given day
  const getUserHourCountForDay = (dateId) => {
    if (!roomData?.votes || !dateId || !myMemberId) return 0;
    const dateVotes = roomData.votes[dateId] || {};
    let count = 0;
    roomHours.forEach((slot) => {
      if (
        dateVotes[slot.hour] &&
        dateVotes[slot.hour][myMemberId] === "available"
      ) {
        count++;
      }
    });
    return count;
  };

  // Current Member Object
  const currentMemberObj = roomData?.members?.[myMemberId];

  // ==========================================
  // VIEW 1: HOME SCREEN (CREATE / JOIN ROOM)
  // ==========================================
  if (currentView === "home") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 flex flex-col justify-center items-center">
        <div className="w-full max-w-md space-y-6">
          {/* LOGO HEADER */}
          <div className="text-center space-y-2">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 items-center justify-center text-white shadow-xl shadow-indigo-500/20">
              <Music className="w-8 h-8 stroke-[2.5]" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Band Rehearsal Sync
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              공연/합주 팀원들이 터치 한 번으로 가능한 시간을 맞추는 모바일
              최적화 일정 공유 플랫폼
            </p>
          </div>

          {/* CREATE NEW ROOM FORM */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Plus className="w-4 h-4 text-indigo-400" />
              <h2 className="font-extrabold text-sm text-slate-200">
                새로운 합주 일정 생성
              </h2>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  밴드 / 모임 이름
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 블루문 밴드 12월 정기공연 합주"
                  value={createBandName}
                  onChange={(e) => setCreateBandName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* DATE PICKERS (START & END DATE) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    시작 날짜
                  </label>
                  <input
                    type="date"
                    required
                    value={createStartDate}
                    onChange={(e) => setCreateStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    종료 날짜
                  </label>
                  <input
                    type="date"
                    required
                    value={createEndDate}
                    onChange={(e) => setCreateEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* TIME BOUNDS SELECTORS */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    시작 시간
                  </label>
                  <select
                    value={createStartHour}
                    onChange={(e) => setCreateStartHour(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {[6, 8, 9, 10, 11, 12, 13, 14].map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00부터
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    종료 시간
                  </label>
                  <select
                    value={createEndHour}
                    onChange={(e) => setCreateEndHour(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {[20, 21, 22, 23, 24].map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00까지
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-600/30 hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-1.5"
              >
                <span>합주 일정 생성하기</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* JOIN EXISTING ROOM BY ID */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs space-y-3">
            <span className="font-bold text-slate-300 block">
              기존 초대 코드로 입장하기
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Room ID 입력 (예: band-x9a2b)"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.trim())}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => {
                  if (roomId) {
                    window.location.hash = `#room=${roomId}`;
                    setCurrentView("join");
                  }
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold rounded-xl border border-slate-700"
              >
                입장
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: MEMBER JOIN SCREEN (SELECT ROLE)
  // ==========================================
  if (currentView === "join") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 flex flex-col justify-center items-center">
        <div className="w-full max-w-md space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold">
                합주 조율 모임 입장
              </span>
              <h1 className="text-xl font-black text-white">
                {roomData?.bandName || "밴드 일정"}
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {roomData?.startDate} ~ {roomData?.endDate}
                </span>
              </p>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  내 이름 / 닉네임
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 김민준, 이보컬"
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1.5">
                  담당 악기 / 세션 파트
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BAND_ROLES.map((role) => (
                    <button
                      type="button"
                      key={role.id}
                      onClick={() => setUserRoleInput(role.id)}
                      className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                        userRoleInput === role.id
                          ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 font-bold"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {role.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-600/30 hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-1.5 text-sm"
              >
                <span>입장하여 시간표 칠하기</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          <button
            onClick={() => {
              window.location.hash = "";
              setCurrentView("home");
            }}
            className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 text-center"
          >
            ← 홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: MAIN APP SCREEN (VOTE & RESULTS)
  // ==========================================
  const membersCount = Object.keys(roomData?.members || {}).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-28">
      {/* APP TOP HEADER */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-white leading-tight truncate max-w-[180px]">
                {roomData?.bandName}
              </h1>
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <span>
                  {currentMemberObj
                    ? `${currentMemberObj.name} (${currentMemberObj.roleLabel})`
                    : "참여자"}
                </span>
                <span className="text-slate-600">•</span>
                <button
                  onClick={handleLeaveRoom}
                  className="text-indigo-400 underline"
                >
                  변경
                </button>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyShareLink}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copiedLink ? "복사됨!" : "초대 링크"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT WRAPPER */}
      <main className="max-w-md mx-auto px-4 pt-3 space-y-4">
        {/* TAB SEGMENT CONTROL */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab("vote")}
            className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === "vote"
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>시간 칠하기</span>
          </button>
          <button
            onClick={() => setActiveTab("best")}
            className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === "best"
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>최적 타임</span>
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === "members"
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>멤버 ({membersCount})</span>
          </button>
        </div>

        {/* TAB 1: TIME SCHEDULE INPUT */}
        {activeTab === "vote" && (
          <div className="space-y-3">
            {/* HORIZONTAL DATE CAROUSEL */}
            <div className="bg-slate-900/90 rounded-2xl p-2.5 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-medium px-1 mb-2 flex justify-between items-center">
                <span>날짜 선택 (가로 스크롤 가능)</span>
                <span className="text-indigo-400 font-bold">
                  {roomDates.find((d) => d.id === selectedDateId)?.monthNum}월{" "}
                  {roomDates.find((d) => d.id === selectedDateId)?.dateNum}일
                </span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
                {roomDates.map((day) => {
                  const isSelected = day.id === selectedDateId;
                  const hourCount = getUserHourCountForDay(day.id);

                  return (
                    <button
                      key={day.id}
                      onClick={() => setSelectedDateId(day.id)}
                      className={`min-w-[56px] flex flex-col items-center py-2 px-1.5 rounded-xl transition-all relative ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105 font-bold"
                          : "bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800"
                      }`}
                    >
                      <span
                        className={`text-[10px] ${
                          isSelected
                            ? "text-indigo-200"
                            : day.isWeekend
                            ? "text-amber-400"
                            : "text-slate-400"
                        }`}
                      >
                        {day.dayName}
                      </span>
                      <span className="text-xs font-black my-0.5">
                        {day.monthNum}/{day.dateNum}
                      </span>

                      {hourCount > 0 ? (
                        <span
                          className={`text-[9px] px-1.5 rounded-full font-extrabold ${
                            isSelected
                              ? "bg-white text-indigo-700"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          {hourCount}h
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-600">-</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* QUICK PRESET ACTION BUTTONS */}
            <div className="flex items-center justify-between gap-1.5 text-xs bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
              <button
                onClick={() => {
                  setIsRangeMode(!isRangeMode);
                  setRangeStartHour(null);
                }}
                className={`px-2.5 py-1.5 rounded-lg font-bold border transition-all flex items-center gap-1 shadow-sm ${
                  isRangeMode
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/30 ring-2 ring-indigo-500/50"
                    : "bg-slate-800 hover:bg-slate-700 text-indigo-300 border-slate-700"
                }`}
              >
                <span>↔️</span>
                <span>{isRangeMode ? "선택 취소" : "연속 선택"}</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleQuickPresetFill("evening")}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-medium border border-slate-700"
                >
                  저녁
                </button>
                <button
                  onClick={() => handleQuickPresetFill("all")}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-medium border border-slate-700"
                >
                  전체
                </button>
                <button
                  onClick={() => handleQuickPresetFill("clear")}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-[11px] font-medium border border-slate-700"
                >
                  초기화
                </button>
              </div>
            </div>

            {/* RANGE MODE BANNER */}
            {isRangeMode && (
              <div className="bg-indigo-600/20 border border-indigo-500/50 text-indigo-200 text-[11px] font-bold py-2 px-3 rounded-xl text-center shadow-lg animate-pulse flex items-center justify-center gap-2">
                {rangeStartHour === null
                  ? "👇 시작할 시간을 먼저 탭하세요"
                  : `👇 끝나는 시간을 탭하세요 (시작: ${rangeStartHour}:00)`}
              </div>
            )}

            {/* HOURS SLOTS (1-HOUR BIG TOUCH CARDS) */}
            <div className="space-y-2">
              {roomHours.map((slot) => {
                const dateVotes = roomData?.votes?.[selectedDateId] || {};
                const hourVotes = dateVotes[slot.hour] || {};
                const myStatus = hourVotes[myMemberId] || "unavailable";

                const membersList = Object.values(roomData?.members || {});
                let availableCount = 0;
                membersList.forEach((m) => {
                  if (hourVotes[m.id] === "available") availableCount++;
                });

                const isRangeStartTarget =
                  isRangeMode && rangeStartHour === slot.hour;

                return (
                  <div
                    key={slot.hour}
                    onClick={() =>
                      handleToggleSlotStatus(selectedDateId, slot.hour)
                    }
                    className={`group relative overflow-hidden rounded-2xl border p-3.5 transition-all duration-150 active:scale-[0.98] cursor-pointer select-none ${
                      isRangeStartTarget
                        ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-950 shadow-[0_0_15px_rgba(99,102,241,0.5)] z-10"
                        : ""
                    } ${
                      myStatus === "available"
                        ? "bg-emerald-950/30 border-emerald-500/60 shadow-md"
                        : myStatus === "if_need_be"
                        ? "bg-amber-950/30 border-amber-500/60 shadow-md"
                        : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div
                      className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                        myStatus === "available"
                          ? "bg-emerald-500"
                          : myStatus === "if_need_be"
                          ? "bg-amber-500"
                          : "bg-slate-700"
                      }`}
                    />

                    <div className="flex items-center justify-between gap-2 pl-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-white tracking-tight">
                          {slot.label}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {slot.tag}
                        </span>
                      </div>

                      {/* 3-State Toggle Badge */}
                      <div>
                        {myStatus === "available" && (
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 rounded-xl">
                            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                            가능 🟢
                          </span>
                        )}
                        {myStatus === "if_need_be" && (
                          <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 rounded-xl">
                            <HelpCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                            조율 🟡
                          </span>
                        )}
                        {myStatus === "unavailable" && (
                          <span className="flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-xl">
                            <XCircle className="w-3.5 h-3.5 opacity-60" />
                            불가 🔴
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Member Breakdown Row */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 pl-1">
                      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                        {membersList.length === 0 ? (
                          <span className="text-[10px] text-slate-500">
                            참여 멤버 없음
                          </span>
                        ) : (
                          membersList.map((m) => {
                            const st = hourVotes[m.id] || "unavailable";
                            return (
                              <span
                                key={m.id}
                                className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                  st === "available"
                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-semibold"
                                    : st === "if_need_be"
                                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                    : "bg-slate-950 text-slate-400 border-slate-800 line-through opacity-50"
                                }`}
                              >
                                <span>{m.roleLabel.split(" ")[0]}</span>
                                <span>{m.name}</span>
                              </span>
                            );
                          })
                        )}
                      </div>

                      <span className="text-[10px] font-bold text-slate-300 flex-shrink-0 bg-slate-800 px-2 py-0.5 rounded-md">
                        {availableCount}/{membersList.length}명
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: BEST SLOTS RECOMMENDATION RANKINGS */}
        {activeTab === "best" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                <span>최적 합주 타임 랭킹 (2시간 연속)</span>
              </h3>
            </div>

            {bestRehearsalSlots.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                멤버들의 가능 시간 입력이 더 필요합니다.
              </div>
            ) : (
              bestRehearsalSlots.map((slot, idx) => (
                <div
                  key={idx}
                  className={`bg-slate-900 rounded-2xl p-4 border space-y-3 relative overflow-hidden ${
                    idx === 0
                      ? "border-indigo-500/60 shadow-lg shadow-indigo-500/10 bg-gradient-to-br from-indigo-950/40 to-slate-900"
                      : "border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center ${
                          idx === 0
                            ? "bg-amber-400 text-slate-950"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-extrabold text-sm text-slate-100">
                        {slot.monthNum}월 {slot.dateNum}일 ({slot.dayName})
                      </span>
                    </div>

                    <span className="text-xs font-black text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-xl border border-indigo-500/30">
                      {slot.timeLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-emerald-400 text-sm">
                        {slot.availableCount}/{slot.totalMembers}명 가능
                      </span>
                      {slot.isRhythmComplete && (
                        <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                          🥁+🎸 리듬세션 완비
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Member Breakdown */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {slot.memberBreakdown.map((m) => (
                      <div
                        key={m.id}
                        className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center ${
                          m.status === "available"
                            ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                            : m.status === "if_need_be"
                            ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                            : "bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50"
                        }`}
                      >
                        <span className="text-[10px] font-bold">{m.name}</span>
                        <span className="text-[9px] opacity-80">
                          {m.roleLabel.split(" ")[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: MEMBERS ROSTER */}
        {activeTab === "members" && (
          <div className="space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="font-extrabold text-xs text-slate-200">
                  참여 밴드원 리스트 ({membersCount}명)
                </h3>
                <button
                  onClick={handleCopyShareLink}
                  className="text-xs text-indigo-400 font-bold flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>멤버 추가 초대</span>
                </button>
              </div>

              <div className="space-y-2">
                {Object.values(roomData?.members || {}).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-300">
                        {m.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                          <span>{m.name}</span>
                          {m.id === myMemberId && (
                            <span className="bg-indigo-600 text-white text-[9px] px-1.5 rounded-md">
                              나
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {m.roleLabel}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                      입장 완료
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Room Info Details */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-xs text-slate-400 space-y-1">
              <div>
                초대 코드:{" "}
                <span className="font-mono text-indigo-300">{roomId}</span>
              </div>
              <div>
                설정 기간: {roomData?.startDate} ~ {roomData?.endDate}
              </div>
              <div>
                시간대: {roomData?.startHour}:00 ~ {roomData?.endHour}:00
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
