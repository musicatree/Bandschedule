import React, { useState, useEffect, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";
import {
  Music,
  Calendar,
  Users,
  Share2,
  Sparkles,
  Plus,
  ArrowRight,
  UserPlus,
  ChevronRight,
  Award,
  LogOut,
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

const BAND_ROLES = [
  { id: "vocal", label: "🎙️ 보컬", isRhythm: false },
  { id: "guitar", label: "🎸 기타", isRhythm: false },
  { id: "bass", label: "🎸 베이스", isRhythm: true },
  { id: "drums", label: "🥁 드럼", isRhythm: true },
  { id: "keyboard", label: "🎹 건반", isRhythm: false },
  { id: "brass", label: "🎷 섹션/관현악", isRhythm: false },
  { id: "other", label: "🎵 기타/스태프", isRhythm: false },
];

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

const getTodayStr = () => new Date().toISOString().split("T")[0];
const getFutureDateStr = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0];
};

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
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Room Form State
  const [createBandName, setCreateBandName] = useState("");
  const [createStartDate, setCreateStartDate] = useState(getTodayStr());
  const [createEndDate, setCreateEndDate] = useState(getFutureDateStr(14));
  const [createStartHour, setCreateStartHour] = useState(10);
  const [createEndHour, setCreateEndHour] = useState(23);

  // User Identity in Current Room
  const [myMemberId, setMyMemberId] = useState("");
  const [userNameInput, setUserNameInput] = useState("");
  const [userRoleInput, setUserRoleInput] = useState("vocal");

  // Live Room Data
  const [roomData, setRoomData] = useState(null);
  const [activeTab, setActiveTab] = useState("vote");

  // Optimistic Local Votes & Drag Painting State
  const [localVotes, setLocalVotes] = useState({});
  const [paintMode, setPaintMode] = useState("available");
  const [isSaving, setIsSaving] = useState(false);

  const isDraggingRef = useRef(false);
  const dragTargetStatusRef = useRef("available");
  const localVotesRef = useRef({});
  const lastPaintedCellRef = useRef("");

  // UI Utilities
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isGoogleUser = Boolean(user && !user.isAnonymous);

  useEffect(() => {
    localVotesRef.current = localVotes;
  }, [localVotes]);

  // ----------------------------------------------------
  // 1. FIREBASE AUTH INITIALIZATION
  // ----------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        if (!u.isAnonymous && u.displayName) {
          setUserNameInput((prev) => prev || u.displayName);
        }
      } else {
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
      }
    });
    return () => unsubscribe();
  }, []);

  // Google Sign-In Handler
  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const gUser = result.user;
      if (gUser?.displayName) {
        setUserNameInput(gUser.displayName);
      }
      // 이미 이 방에 가입된 구글 계정이면 바로 메인 화면으로 입장
      if (roomData?.members?.[gUser.uid]) {
        setMyMemberId(gUser.uid);
        setIsEditingProfile(false);
        setCurrentView("main");
      }
    } catch (err) {
      console.error("Google login error:", err);
      alert("구글 로그인 중 문제가 발생했습니다. 팝업 차단을 해제하고 다시 시도해 주세요.");
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await signOut(auth);
      setMyMemberId("");
      setUserNameInput("");
      setIsEditingProfile(false);
      if (roomId) {
        localStorage.removeItem(`rehearsal_member_${roomId}`);
        setCurrentView("join");
      } else {
        setCurrentView("home");
      }
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

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
          if (!isDraggingRef.current) {
            setLocalVotes(data.votes || {});
          }

          if (isEditingProfile) return;

          // 1순위: 구글 로그인 계정이 이미 이 방 멤버로 등록되어 있는 경우
          if (!user.isAnonymous && data.members?.[user.uid]) {
            setMyMemberId(user.uid);
            setCurrentView("main");
            return;
          }

          // 2순위: 브라우저에 저장된 게스트 세션이 있는 경우
          const storedMemberId = localStorage.getItem(
            `rehearsal_member_${roomId}`
          );
          if (storedMemberId && data.members?.[storedMemberId]) {
            setMyMemberId(storedMemberId);
            setCurrentView("main");
            return;
          }

          setCurrentView("join");
        } else {
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
  }, [user, roomId, isEditingProfile]);

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
        shortLabel: `${String(h).padStart(2, "0")}:00`,
        label: `${String(h).padStart(2, "0")}:00 - ${String(h + 1).padStart(
          2,
          "0"
        )}:00`,
      });
    }
    return hours;
  }, [roomData]);

  // ----------------------------------------------------
  // 4. SAVE VOTES TO FIRESTORE (BATCH)
  // ----------------------------------------------------
  const saveVotesToFirestore = async (votesToSave) => {
    if (!user || !roomId) return;
    setIsSaving(true);
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
      await setDoc(roomRef, { votes: votesToSave }, { merge: true });
    } catch (err) {
      console.error("Save votes error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleGlobalEnd = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        lastPaintedCellRef.current = "";
        saveVotesToFirestore(localVotesRef.current);
      }
    };
    window.addEventListener("mouseup", handleGlobalEnd);
    window.addEventListener("touchend", handleGlobalEnd);
    return () => {
      window.removeEventListener("mouseup", handleGlobalEnd);
      window.removeEventListener("touchend", handleGlobalEnd);
    };
  }, [user, roomId]);

  const applyCellVote = (dateId, hour, status) => {
    const cellKey = `${dateId}_${hour}`;
    if (lastPaintedCellRef.current === cellKey) return;
    lastPaintedCellRef.current = cellKey;

    setLocalVotes((prev) => {
      const dateVotes = prev[dateId] ? { ...prev[dateId] } : {};
      const hourVotes = dateVotes[hour] ? { ...dateVotes[hour] } : {};
      if (hourVotes[myMemberId] === status) return prev;

      hourVotes[myMemberId] = status;
      dateVotes[hour] = hourVotes;
      const next = { ...prev, [dateId]: dateVotes };
      localVotesRef.current = next;
      return next;
    });
  };

  const handleCellStart = (dateId, hour) => {
    if (!myMemberId) return;
    const currentStatus =
      localVotesRef.current?.[dateId]?.[hour]?.[myMemberId] || "unavailable";
    const targetStatus =
      currentStatus === paintMode ? "unavailable" : paintMode;

    isDraggingRef.current = true;
    dragTargetStatusRef.current = targetStatus;
    lastPaintedCellRef.current = "";
    applyCellVote(dateId, hour, targetStatus);
  };

  const handleCellEnter = (dateId, hour) => {
    if (!isDraggingRef.current || !myMemberId) return;
    applyCellVote(dateId, hour, dragTargetStatusRef.current);
  };

  const handleGridTouchMove = (e) => {
    if (!isDraggingRef.current || !myMemberId) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = el?.closest?.("[data-date][data-hour]");
    if (cell) {
      const dateId = cell.getAttribute("data-date");
      const hour = parseInt(cell.getAttribute("data-hour"), 10);
      if (dateId && !isNaN(hour)) {
        applyCellVote(dateId, hour, dragTargetStatusRef.current);
      }
    }
  };

  const handleToggleDayColumn = (dateId) => {
    if (!myMemberId) return;
    const prev = localVotesRef.current || {};
    const dateVotes = prev[dateId] ? { ...prev[dateId] } : {};

    const allAlreadyMarked = roomHours.every(
      (slot) => dateVotes[slot.hour]?.[myMemberId] === paintMode
    );
    const targetStatus = allAlreadyMarked ? "unavailable" : paintMode;

    roomHours.forEach((slot) => {
      const hourVotes = dateVotes[slot.hour] ? { ...dateVotes[slot.hour] } : {};
      hourVotes[myMemberId] = targetStatus;
      dateVotes[slot.hour] = hourVotes;
    });

    const next = { ...prev, [dateId]: dateVotes };
    setLocalVotes(next);
    localVotesRef.current = next;
    saveVotesToFirestore(next);
  };

  const handleQuickPresetFill = (presetType) => {
    if (!myMemberId) return;
    const next = { ...(localVotesRef.current || {}) };

    roomDates.forEach((day) => {
      const dateVotes = { ...(next[day.id] || {}) };
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
      next[day.id] = dateVotes;
    });

    setLocalVotes(next);
    localVotesRef.current = next;
    saveVotesToFirestore(next);
  };

  // ----------------------------------------------------
  // 5. ROOM CREATE / JOIN / SHARE HANDLERS
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
      startHour: parseInt(createStartHour, 10),
      endHour: parseInt(createEndHour, 10),
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
    // 구글 로그인 사용자는 고유 uid를 사용하여 중복 생성 방지
    const memberId = isGoogleUser
      ? user.uid
      : myMemberId || "m_" + Math.random().toString(36).substr(2, 7);

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
        isGoogle: isGoogleUser,
        joinedAt:
          roomData.members?.[memberId]?.joinedAt || new Date().toISOString(),
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

      if (!isGoogleUser) {
        localStorage.setItem(`rehearsal_member_${roomId}`, memberId);
      }
      setMyMemberId(memberId);
      setIsEditingProfile(false);
      setCurrentView("main");
    } catch (err) {
      console.error("Join room error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyShareLink = () => {
    const fullUrl = `${window.location.origin}${window.location.pathname}#room=${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleEditProfile = () => {
    const me = roomData?.members?.[myMemberId];
    if (me) {
      setUserNameInput(me.name);
      setUserRoleInput(me.roleId);
    }
    setIsEditingProfile(true);
    setCurrentView("join");
  };

  // ----------------------------------------------------
  // 6. CALCULATE BEST CONTINUOUS REHEARSAL SLOTS (TOP 5)
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

    const votes = localVotes || {};
    const candidateBlocks = [];

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
  }, [roomData, localVotes, roomDates, roomHours]);

  const currentMemberObj = roomData?.members?.[myMemberId];

  // ==========================================
  // VIEW 1: HOME SCREEN (CREATE / JOIN ROOM)
  // ==========================================
  if (currentView === "home") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 flex flex-col justify-center items-center">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 items-center justify-center text-white shadow-xl shadow-indigo-500/20">
              <Music className="w-8 h-8 stroke-[2.5]" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Band Rehearsal Sync
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              공연/합주 팀원들이 드래그 한 번으로 가능한 시간을 맞추는 일정 공유
              플랫폼
            </p>
          </div>

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
  // VIEW 2: MEMBER JOIN SCREEN (GOOGLE LOGIN + ROLE)
  // ==========================================
  if (currentView === "join") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 flex flex-col justify-center items-center">
        <div className="w-full max-w-md space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold">
                {isEditingProfile ? "내 프로필 수정" : "합주 조율 모임 입장"}
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

            {/* GOOGLE LOGIN SECTION */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              {isGoogleUser ? (
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-emerald-400 font-bold block">
                      ✓ Google 계정 연결됨
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {user.email}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="text-[11px] text-slate-400 hover:text-rose-400 underline"
                  >
                    계정 변경
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow transition-all"
                  >
                    <span className="font-black text-sm text-blue-600">G</span>
                    <span>Google로 로그인 (내 시간표 영구 유지)</span>
                  </button>
                  <p className="text-[10px] text-slate-500 text-center">
                    구글로 로그인하면 다른 기기에서도 중복 없이 내 일정을
                    수정할 수 있습니다.
                  </p>
                </div>
              )}
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
                <span>
                  {isEditingProfile ? "프로필 저장하기" : "입장하여 시간표 칠하기"}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          <button
            onClick={() => {
              if (isEditingProfile) {
                setIsEditingProfile(false);
                setCurrentView("main");
              } else {
                window.location.hash = "";
                setCurrentView("home");
              }
            }}
            className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 text-center"
          >
            {isEditingProfile ? "← 시간표로 돌아가기" : "← 홈으로 돌아가기"}
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: MAIN APP SCREEN (MULTI-DAY DRAG GRID & RESULTS)
  // ==========================================
  const membersList = Object.values(roomData?.members || {});
  const membersCount = membersList.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      {/* APP TOP HEADER */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-white leading-tight truncate max-w-[160px] sm:max-w-xs">
                {roomData?.bandName}
              </h1>
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <span>
                  {currentMemberObj
                    ? `${currentMemberObj.name} (${currentMemberObj.roleLabel})`
                    : "참여자"}
                </span>
                <button
                  onClick={handleEditProfile}
                  className="text-
