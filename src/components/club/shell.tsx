"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Moon,
  Sun,
  RefreshCw,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Home,
  Info,
  LogIn,
  MoreHorizontal,
  ShieldCheck,
  UserRound,
  Users,
  WifiOff,
} from "lucide-react";

import { ResetPasswordScreen } from "./auth";

import { api, Loader, Empty, ErrorBoxStandalone, Brand, Context } from "./core";
import {
  HomeScreen,
  CalendarScreen,
  EventScreen,
  NoticesScreen,
  RulesScreen,
  GuestGuide,
} from "./public";
const ApplicationForm = dynamic(
  () => import("./member").then((m) => m.ApplicationForm),
  { loading: Loader },
);
const AccountScreen = dynamic(
  () => import("./member").then((m) => m.AccountScreen),
  { loading: Loader },
);
const ProfileScreen = dynamic(
  () => import("./member").then((m) => m.ProfileScreen),
  { loading: Loader },
);
const MyActivity = dynamic(() => import("./member").then((m) => m.MyActivity), {
  loading: Loader,
});
const NotificationsScreen = dynamic(
  () => import("./member").then((m) => m.NotificationsScreen),
  { loading: Loader },
);
const VideosScreen = dynamic(
  () => import("./member").then((m) => m.VideosScreen),
  { loading: Loader },
);
const VideoDetailScreen = dynamic(
  () => import("./member").then((m) => m.VideoDetailScreen),
  { loading: Loader },
);
const SupportHome = dynamic(
  () => import("./support").then((m) => m.SupportHome),
  { loading: Loader },
);
const SupportInbox = dynamic(() => import("./support").then((m) => m.Inbox), {
  loading: Loader,
});
const SupportThread = dynamic(() => import("./support").then((m) => m.Thread), {
  loading: Loader,
});
const FaqEditor = dynamic(() => import("./support").then((m) => m.FaqEditor), {
  loading: Loader,
});
import { LoadTime } from "./load-time";
import { SupportLinks } from "./support-links";
const AdminHome = dynamic(() => import("./admin").then((m) => m.AdminHome), {
  loading: Loader,
});
const AdminGuests = dynamic(
  () => import("./admin").then((m) => m.AdminGuests),
  { loading: Loader },
);
const AdminMembers = dynamic(
  () => import("./admin").then((m) => m.AdminMembers),
  { loading: Loader },
);
const AdminMore = dynamic(() => import("./admin").then((m) => m.AdminMore), {
  loading: Loader,
});
const AdminAttendance = dynamic(
  () => import("./admin").then((m) => m.AdminAttendance),
  { loading: Loader },
);
const AdminDues = dynamic(() => import("./admin").then((m) => m.AdminDues), {
  loading: Loader,
});
const AdminNotices = dynamic(
  () => import("./admin").then((m) => m.AdminNotices),
  { loading: Loader },
);
const AdminUniforms = dynamic(
  () => import("./admin").then((m) => m.AdminUniforms),
  { loading: Loader },
);
const SettingsScreen = dynamic(
  () => import("./admin").then((m) => m.SettingsScreen),
  { loading: Loader },
);
const AnalyticsScreen = dynamic(
  () => import("./operations").then((m) => m.AnalyticsScreen),
  { loading: Loader },
);
const RosterScreen = dynamic(
  () => import("./operations").then((m) => m.RosterScreen),
  { loading: Loader },
);
const ExportScreen = dynamic(
  () => import("./operations").then((m) => m.ExportScreen),
  { loading: Loader },
);
const ImportScreen = dynamic(
  () => import("./operations").then((m) => m.ImportScreen),
  { loading: Loader },
);
export default function ClubApp() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const preview = pathname.startsWith("/preview");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const preference = localStorage.getItem("spotlight-theme");
    setDark(
      preference
        ? preference === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("spotlight-theme", next ? "dark" : "light");
  };
  const [boot, setBoot] = useState<any>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(false);
  const [install, setInstall] = useState<any>(null);
  const screen =
    (preview ? pathname.replace(/^\/preview/, "") : pathname) || "/";
  const adminScreen = screen.startsWith("/admin");
  const refresh = () => setRevision((v) => v + 1);
  const link = (path: string) =>
    preview
      ? `/preview${path === "/" ? "" : path}${path.includes("?") ? "&" : "?"}role=${boot?.role || params.get("role") || "guest"}`
      : path;
  useEffect(() => {
    let live = true;
    const request = preview
      ? import("@/lib/preview").then(({ previewData }) =>
          previewData(params.get("role") || "guest"),
        )
      : api("bootstrap");
    request
      .then((v) => {
        if (live) setBoot(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [preview, params.get("role"), revision]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", prompt);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  useEffect(() => {
    let startY: number | null = null;
    let startX = 0;
    const start = (e: TouchEvent) => {
      startY =
        window.scrollY === 0 && !document.querySelector("dialog[open]")
          ? e.touches[0].clientY
          : null;
      startX = e.touches[0].clientX;
    };
    const end = (e: TouchEvent) => {
      if (
        startY !== null &&
        e.changedTouches[0].clientY - startY > 110 &&
        Math.abs(e.changedTouches[0].clientX - startX) < 60
      ) {
        setRevision((v) => v + 1);
        setToast("최신 정보를 불러오는 중이에요.");
      }
      startY = null;
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchend", end);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const mutate = async (path: string, data: any, method = "POST") => {
    if (preview)
      throw new Error("미리보기에서는 실제 데이터를 저장하지 않습니다.");
    if (offline) throw new Error("인터넷에 연결한 후 다시 시도해주세요.");
    const result = await api(path, { method, body: JSON.stringify(data) });
    refresh();
    setToast("반영했습니다.");
    return result;
  };
  const context = {
    boot,
    screen,
    revision,
    refresh,
    link,
    mutate,
    toast: setToast,
    install,
    installApp: async () => {
      if (install) {
        await install.prompt();
        setInstall(null);
      } else
        setToast(
          "iPhone: Safari 공유 → 홈 화면에 추가 · Android: 브라우저 메뉴 → 앱 설치",
        );
    },
  };
  if (!boot)
    return (
      <div className="app-shell">
        <header className="app-bar">
          <Brand />
        </header>
        <main className="content">
          {error ? (
            <ErrorBoxStandalone
              message={error}
              retry={() => {
                setError("");
                refresh();
              }}
            />
          ) : (
            <Loader />
          )}
        </main>
      </div>
    );
  const nav = adminScreen
    ? [
        { href: "/admin", label: "홈", icon: Home },
        { href: "/admin/guests", label: "게스트", icon: Users },
        { href: "/admin/members", label: "회원", icon: UserRound },
        { href: "/admin/calendar", label: "일정", icon: CalendarDays },
        { href: "/admin/more", label: "더보기", icon: MoreHorizontal },
      ]
    : boot.member
      ? [
          { href: "/", label: "홈", icon: Home },
          { href: "/calendar", label: "일정", icon: CalendarDays },
          { href: "/attendance", label: "출석", icon: CheckCircle2 },
          { href: "/account", label: "내 정보", icon: UserRound },
        ]
      : [
          { href: "/", label: "홈", icon: Home },
          { href: "/calendar", label: "일정", icon: CalendarDays },
          { href: "/apply", label: "신청", icon: ClipboardList },
          { href: "/notices", label: "공지", icon: Bell },
        ];
  return (
    <Context.Provider value={context}>
      <div
        className={
          adminScreen && boot.role === "admin"
            ? "app-shell ops-shell"
            : "app-shell"
        }
      >
        {preview && (
          <div className="preview-bar">
            <span>미리보기 · 가상 데이터</span>
            <Link href="/">미리보기 종료</Link>
            <select
              aria-label="미리보기 역할"
              value={boot.role}
              onChange={(e) =>
                router.push(
                  e.target.value === "admin"
                    ? "/preview/admin?role=admin"
                    : `/preview?role=${e.target.value}`,
                )
              }
            >
              <option value="guest">게스트</option>
              <option value="member">회원</option>
              <option value="admin">운영진</option>
            </select>
          </div>
        )}
        <header className="app-bar">
          <Link
            href={link(adminScreen ? "/admin" : "/")}
            aria-label="SpotLight 홈"
          >
            <Brand />
          </Link>
          <div className="app-bar-actions">
            <button
              className="icon-button"
              aria-label={dark ? "라이트모드로 변경" : "다크모드로 변경"}
              aria-pressed={dark}
              onClick={toggleTheme}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button"
              aria-label="새로고침"
              onClick={refresh}
            >
              <RefreshCw size={18} />
            </button>
            {boot.admin || boot.role === "admin" ? (
              <Link
                className="mode-link"
                href={link(adminScreen ? "/" : "/admin")}
              >
                {adminScreen ? "회원 모드" : "운영 모드"}
                <ShieldCheck size={14} />
              </Link>
            ) : null}
            {boot.member ? (
              <Link
                className="icon-button"
                href={link("/notifications")}
                aria-label="알림"
              >
                <Bell size={21} />
              </Link>
            ) : (
              <Link href={link("/account")} className="login-link">
                로그인
                <LogIn size={15} />
              </Link>
            )}
          </div>
        </header>
        {offline && (
          <div className="offline-banner" role="status">
            <WifiOff size={16} />
            오프라인입니다. 연결 후 다시 시도해주세요.
          </div>
        )}
        {!boot.configured && !preview && (
          <div className="setup-banner">
            <Info size={17} />
            <span>서비스 준비 중 · 데이터베이스 연결이 필요합니다.</span>
          </div>
        )}
        <main id="main-content" className="content" key={screen}>
          {params.get("measure") === "1" && <LoadTime screen={screen} />}
          {adminScreen && boot.role !== "admin" ? (
            <Empty icon={ShieldCheck} title="운영진 권한이 필요해요">
              SpotLight에 로그인한 뒤 승인된 운영진 계정으로 이용해주세요.
              <Link href={link("/account")} className="button primary">
                로그인하기
              </Link>
            </Empty>
          ) : (
            <Screens screen={screen} />
          )}
        </main>
        <nav className="bottom-nav" aria-label="주 메뉴">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? screen === "/"
                : href === "/admin"
                  ? screen === "/admin"
                  : screen === href || screen.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={link(href)}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
              >
                <span>
                  <Icon size={22} />
                </span>
                <small>{label}</small>
              </Link>
            );
          })}
        </nav>
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {toast}
          </div>
        )}
      </div>
    </Context.Provider>
  );
}

export function Screens({ screen }: { screen: string }) {
  if (screen === "/support") return <SupportHome />;
  if (screen === "/support/mine") return <SupportInbox />;
  if (screen === "/admin/support") return <SupportInbox admin />;
  if (screen === "/admin/support/faqs") return <FaqEditor />;
  if (/^\/(admin\/)?support\/[^/]+$/.test(screen))
    return (
      <SupportThread
        id={screen.split("/").at(-1)!}
        admin={screen.startsWith("/admin/")}
      />
    );
  if (screen === "/")
    return (
      <>
        <HomeScreen />
        <SupportLinks />
      </>
    );
  if (screen === "/calendar" || screen === "/admin/calendar")
    return <CalendarScreen />;
  if (screen.startsWith("/admin/events/"))
    return <EventScreen id={screen.split("/")[3]} />;
  if (screen === "/guest-guide") return <GuestGuide />;
  if (screen.startsWith("/events/"))
    return <EventScreen id={screen.split("/")[2]} />;
  if (screen === "/apply") return <ApplicationForm />;
  if (screen === "/join") return <ApplicationForm membership />;
  if (screen === "/notices") return <NoticesScreen />;
  if (screen === "/rules") return <RulesScreen />;
  if (/^\/(videos|playlists)\/[^/]+$/.test(screen))
    return (
      <VideoDetailScreen
        source={screen.split("/")[1]}
        id={screen.split("/")[2]}
      />
    );
  if (screen === "/videos")
    return (
      <>
        <VideosScreen />
        <SupportLinks category="video" />
      </>
    );
  if (screen === "/account") return <AccountScreen />;
  if (screen === "/reset-password") return <ResetPasswordScreen />;
  if (screen === "/profile") return <ProfileScreen />;
  if (screen === "/attendance") return <MyActivity />;
  if (screen === "/dues")
    return (
      <>
        <MyActivity dues />
        <SupportLinks category="dues" />
      </>
    );
  if (screen === "/uniform") return <MyActivity uniform />;
  if (screen === "/notifications") return <NotificationsScreen />;
  if (screen === "/admin") return <AdminHome />;
  if (screen === "/admin/guests") return <AdminGuests />;
  if (screen === "/admin/members") return <AdminMembers />;
  if (screen === "/admin/more") return <AdminMore />;
  if (screen === "/admin/attendance") return <AdminAttendance />;
  if (screen === "/admin/dues") return <AdminDues />;
  if (screen === "/admin/notices") return <AdminNotices />;
  if (screen === "/admin/videos") return <VideosScreen admin />;
  if (screen === "/admin/analytics") return <AnalyticsScreen />;
  if (screen === "/admin/roster") return <RosterScreen />;
  if (screen === "/admin/export") return <ExportScreen />;
  if (screen === "/admin/import") return <ImportScreen />;
  if (screen === "/admin/uniforms") return <AdminUniforms />;
  if (screen === "/admin/settings") return <SettingsScreen />;
  return (
    <Empty title="페이지를 찾을 수 없어요">
      <Link href="/">홈으로</Link>
    </Empty>
  );
}
