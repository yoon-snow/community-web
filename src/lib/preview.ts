import { sortAnnouncements, seoulDate, type ClubRow } from "./domain";
export function previewData(role = "guest") {
  const today = new Date();
  const next = new Date(today);
  next.setDate(today.getDate() + 2);
  next.setHours(19, 0, 0, 0);
  const end = new Date(next);
  end.setHours(22);
  const before = new Date(today);
  before.setDate(today.getDate() - 3);
  before.setHours(19);
  const bEnd = new Date(before);
  bEnd.setHours(22);
  const id = "11111111-1111-4111-8111-111111111111";
  const events = [
    {
      id,
      title: "함께 만드는, 좋은 한 게임",
      starts_at: next.toISOString(),
      ends_at: end.toISOString(),
      location: "SpotLight 체육관 · 예시 장소",
      kind: "game",
      is_emergency: true,
      change_reason: "체육관 변경 안내 · 미리보기 예시입니다.",
      description:
        "워밍업부터 마지막 한 점까지. 서로를 응원하며 즐겁게 운동해요.\n장소와 시간은 미리보기용 예시입니다.",
      guests_open: true,
      guest_fee: 5000,
      status: "scheduled",
    },
    ...[4, 7, 9, 11, 14, 16, 18, 21, 23, 25, 28].map((day, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), day, 19);
      const e = new Date(d);
      e.setHours(22);
      return {
        id: `${i + 2}1111111-1111-4111-8111-111111111111`,
        title: i % 2 ? "Lesson Day" : "Game Day",
        starts_at: d.toISOString(),
        ends_at: e.toISOString(),
        location: "SpotLight 체육관 · 예시 장소",
        kind: i % 2 ? "lesson" : "game",
        description: "미리보기 일정",
        guests_open: true,
        guest_fee: i % 2 ? 15000 : 5000,
        status: "scheduled",
      };
    }),
    {
      id: "99999999-1111-4111-8111-111111111111",
      title: "지난 정기 운동",
      starts_at: before.toISOString(),
      ends_at: bEnd.toISOString(),
      location: "SpotLight 체육관",
      kind: "practice",
      description: "",
      guests_open: false,
      guest_fee: 5000,
      status: "completed",
    },
  ];
  const member =
    role === "guest"
      ? null
      : {
          id: "22222222-2222-4222-8222-222222222222",
          name: "스포트",
          phone: "01000000000",
          position: "세터",
          experience: "3년",
          joined_on: "2026-01-01",
          status: "active",
          avatar_path: null,
          avatar_url: null,
          birth_date: "1998-01-01",
          user_id: "33333333-3333-4333-8333-333333333333",
        };
  return {
    configured: false,
    preview: true,
    role,
    member,
    user: member
      ? { id: member.user_id, email: "preview@example.invalid" }
      : null,
    titles: role === "admin" ? ["총무", "게스트 담당"] : [],
    application: null,
    events,
    announcements: [
      {
        id: "aaaaaaaa-1111-4111-8111-111111111111",
        title: "코트에서 만나요, SpotLight!",
        content:
          "함께 땀 흘리고 서로를 응원하는 배구 커뮤니티입니다. 신청 전 일정과 게스트 안내를 확인해주세요.",
        kind: "required",
        audience: "public",
      },
      {
        id: "aaaaaaaa-2222-4222-8222-222222222222",
        title: "운동 장소 변경 안내 · 미리보기",
        content:
          "이 공지는 미리보기용 예시입니다. 실제 일정이 아닙니다. 운동 전 장소를 다시 확인해주세요.",
        kind: "emergency",
        audience: "public",
      },
      {
        id: "aaaaaaaa-3333-4333-8333-333333333333",
        title: "이번 달 클럽 소식",
        content: "서로를 배려하며 즐겁게 운동해요.",
        kind: "general",
        audience: "public",
      },
      {
        id: "aaaaaaaa-4444-4444-8444-444444444444",
        title: "SpotLight 교류전 안내",
        content: "이벤트 일정과 참가 안내는 추후 공지합니다.",
        kind: "event",
        audience: "public",
      },
      {
        id: "aaaaaaaa-5555-4555-8555-555555555555",
        title: "회원 전용 공지",
        content: "회원용 안내 예시입니다.",
        kind: "general",
        audience: "member",
      },
      {
        id: "aaaaaaaa-6666-4666-8666-666666666666",
        title: "운영진 전용 공지",
        content: "운영진용 안내 예시입니다.",
        kind: "general",
        audience: "admin",
      },
    ]
      .filter(
        (n) =>
          n.audience === "public" ||
          role === "admin" ||
          (role === "member" && n.audience === "member"),
      )
      .map((n) => ({
        ...n,
        version: 1,
        created_at: today.toISOString(),
        updated_at: today.toISOString(),
        starts_at: new Date(today.getTime() - 3600000).toISOString(),
        ends_at: null,
        deleted_at: null,
      })),
    rules: [
      {
        id: "rule-1",
        category: "guest",
        title: "게스트 참가 안내",
        current_version: 1,
        rule_versions: [
          {
            version: 1,
            published: true,
            content:
              "레슨데이 15,000원 · 게임데이 5,000원\n입금 확인 후 참여가 확정됩니다.\n운동화를 준비하고 서로를 배려해주세요.",
          },
        ],
      },
    ],
    questions: [
      ["name", "이름"],
      ["birth_date", "생년월일"],
      ["gender", "성별"],
      ["phone", "연락처"],
      ["position", "희망 포지션"],
      ["experience", "배구 경력"],
      ["source", "SpotLight를 알게 된 경로"],
      ["notes", "기타 확인사항 및 질문"],
      ["event_id", "참여할 운동"],
      ["notice_consent", "공지사항을 확인했습니다. (필수)"],
      ["rules_consent", "게스트 참가 규정·회칙을 확인하고 동의합니다. (필수)"],
      [
        "photo_consent",
        "활동 사진·영상이 동호회 기록 및 홍보에 활용되는 안내를 확인하고 동의합니다. (필수)",
      ],
      ["privacy_consent", "개인정보 수집·이용에 동의합니다. (필수)"],
      ["self_reported_paid", "입금을 완료하셨나요?"],
      [
        "fee_acknowledgement",
        "운영진의 실제 입금 확인 후 확정됨을 이해했습니다.",
      ],
    ].map(([field_key, label], i) => ({
      id: `aaaaaaa${i.toString(16)}-1111-4111-8111-111111111111`,
      form: "guest",
      key: `base_${field_key}`,
      field_key,
      label,
      type: "text",
      options: [],
      required: !["source", "notes"].includes(field_key),
      active: true,
      is_system: true,
      version: 1,
      help_text: "",
      sort_order: i,
    })),
    bank: { bank: "카카오뱅크", account: "3333349466142", holder: "황태호" },
    acceptingApplications: false,
    privacy: {
      text: "실제 서비스에서 개인정보 안내가 표시됩니다.",
      retentionDays: "",
      contact: "",
    },
  };
}
export function previewResource(path: string, boot: ClubRow): any {
  const event = boot.events[0],
    member = boot.member || {
      id: "22222222-2222-4222-8222-222222222222",
      name: "스포트",
      position: "세터",
    };
  const members = ["스포트", "라이트", "코트", "리시브", "토스", "서브"].map(
    (name, i) => ({
      ...member,
      id: i === 0 ? member.id : `${i + 3}2222222-2222-4222-8222-222222222222`,
      name,
      position: ["세터", "레프트", "센터"][i % 3],
      birth_date: "1998-01-01",
      phone: "01000000000",
      status: "active",
      joined_on: "2026-01-01",
      admins: null,
      member_notes: null,
    }),
  );
  const attendance = boot.events
    .filter((e: ClubRow) => new Date(e.ends_at) < new Date())
    .map((e: ClubRow, i: number) => ({
      id: e.id,
      event_id: e.id,
      member_id: member.id,
      response: "yes",
      actual: i % 3 !== 1,
      events: e,
    }));
  const payments = [0, 1, 2].map((i) => ({
    id: String(i),
    month: seoulDate(
      new Date(new Date().getFullYear(), new Date().getMonth() - i, 1, 12),
    ),
    status: i === 0 ? "unpaid" : "paid",
    amount: 60000,
    member_id: member.id,
    members: member,
  }));
  const guestRows = [
    "첫방문",
    "다시온",
    "스파이크",
    "블로킹",
    "리베로",
    "퀵토스",
  ].map((name, i) => ({
    id: `${i + 4}3333333-3333-4333-8333-333333333333`,
    event_id: event.id,
    guests: {
      id: String(i),
      name,
      position: i % 2 ? "세터" : "레프트",
      phone: "01000000000",
    },
    events: event,
    guest_payments: { status: i < 2 ? "pending" : "paid", amount: 5000 },
    answers: {
      experience: "2년",
      gender: i % 2 ? "남성" : "여성",
      birth_date: "1998-01-01",
      source: "지인",
      notes: "미리보기 신청",
    },
    self_reported_paid: true,
    submitted_at: new Date().toISOString(),
  }));
  const query = new URL(path, "https://preview.invalid/").searchParams;
  const validAttendance = attendance.filter(
    (a: ClubRow) =>
      a.events &&
      ["scheduled", "completed"].includes(a.events.status) &&
      a.events.kind !== "holiday",
  );
  const actual = validAttendance.filter((a: ClubRow) => a.actual === true);
  const attendanceSummary = (year: number) => ({
    year,
    year_attendance: actual.filter(
      (a: ClubRow) =>
        Number(seoulDate(a.events.starts_at).slice(0, 4)) === year,
    ).length,
    total_attendance: actual.length,
    last_attended_at:
      actual
        .map((a: ClubRow) => a.events.starts_at)
        .sort()
        .at(-1) || null,
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: actual.filter(
        (a: ClubRow) =>
          seoulDate(a.events.starts_at).slice(0, 7) ===
          `${year}-${String(i + 1).padStart(2, "0")}`,
      ).length,
    })),
  });
  const allDues = payments.flatMap((p: ClubRow) =>
    members.map((m, i) => ({
      ...p,
      id: `${p.id}-${m.id}`,
      member_id: m.id,
      members: m,
      status: ["unpaid", "paid", "exempt"][i % 3],
    })),
  );
  const scopedDues = allDues.filter(
    (p: ClubRow) =>
      p.month.startsWith(query.get("month") || seoulDate().slice(0, 7)) &&
      (!query.get("member") || p.member_id === query.get("member")),
  );
  if (
    path.startsWith("my-attendance") ||
    path.startsWith("admin/attendance-report")
  ) {
    const year = Number(query.get("year") || seoulDate().slice(0, 4));
    const page = Number(query.get("page") || 0);
    const rows = validAttendance
      .filter(
        (a: ClubRow) =>
          Number(seoulDate(a.events.starts_at).slice(0, 4)) === year,
      )
      .sort((a: ClubRow, b: ClubRow) =>
        b.events.starts_at.localeCompare(a.events.starts_at),
      );
    return {
      summary: attendanceSummary(year),
      rows: rows.slice(page * 30, page * 30 + 30),
      total: rows.length,
    };
  }
  if (path.startsWith("admin/dashboard")) {
    const selected =
      boot.events.find((e: ClubRow) => e.id === query.get("event")) || event;
    const rows = guestRows.filter((g) => g.event_id === selected.id);
    const paid = rows.filter((g) => g.guest_payments.status === "paid").length;
    return {
      event: selected,
      today_events: boot.events.filter(
        (e: ClubRow) =>
          seoulDate(e.starts_at) === seoulDate() &&
          ["scheduled", "completed"].includes(e.status) &&
          e.kind !== "holiday",
      ),
      counts: { members: 18, guests: paid, total: 18 + paid },
      guest_summary: {
        applications: rows.length,
        paid,
        pending: rows.length - paid,
      },
      tasks: {
        pending_guests: guestRows.filter(
          (g) => g.guest_payments.status === "pending",
        ).length,
        pending_members: 1,
        unpaid_members: allDues.filter(
          (p: ClubRow) =>
            p.month.startsWith(seoulDate().slice(0, 7)) &&
            p.status === "unpaid",
        ).length,
        unanswered: 5,
      },
      recent_guests: guestRows.slice(0, 5),
    };
  }
  if (path.startsWith("admin/dues-summary"))
    return {
      registered: scopedDues.length,
      paid: scopedDues.filter((p: ClubRow) => p.status === "paid").length,
      unpaid: scopedDues.filter((p: ClubRow) => p.status === "unpaid").length,
      exempt: scopedDues.filter((p: ClubRow) => p.status === "exempt").length,
      unregistered: 0,
    };
  if (path.startsWith("guest-guidance")) {
    const params = new URL(path, "https://preview.invalid/").searchParams;
    return {
      event:
        boot.events.find((e: ClubRow) => e.id === params.get("event")) || null,
      announcements: sortAnnouncements(
        boot.announcements.filter((n: ClubRow) => n.audience === "public"),
      ),
    };
  }
  if (path.startsWith("notices?")) {
    const params = new URL(path, "https://preview.invalid/").searchParams;
    const rows = sortAnnouncements(
      boot.announcements.filter(
        (n: ClubRow) =>
          params.get("kind") === "all" ||
          !params.get("kind") ||
          n.kind === params.get("kind"),
      ),
    );
    return { rows, total: rows.length };
  }
  if (path.startsWith("admin/notices/") && path.endsWith("/versions")) {
    const n = boot.announcements.find(
      (n: ClubRow) => n.id === path.split("/")[2],
    );
    return n
      ? [{ ...n, announcement_id: n.id, recorded_at: n.updated_at }]
      : [];
  }
  if (path.startsWith("events?")) return boot.events;
  if (path.startsWith("events/")) {
    const selectedEvent =
      boot.events.find((e: ClubRow) => e.id === path.split("/")[1]) || event;
    const rows = guestRows.filter((g) => g.event_id === selectedEvent.id);
    const paid = rows.filter((g) => g.guest_payments.status === "paid").length;
    return {
      event: selectedEvent,
      counts: boot.member
        ? { members: 18, guests: paid, total: 18 + paid }
        : null,
      ...(boot.role === "admin"
        ? {
            guest_summary: {
              applications: rows.length,
              paid,
              pending: rows.length - paid,
            },
          }
        : {}),
      response: "unanswered",
      videos: [],
    };
  }
  if (path === "me")
    return {
      summary: {
        year_attendance: attendance.filter(
          (a: ClubRow) =>
            a.actual &&
            a.events &&
            new Date(a.events.starts_at) < new Date() &&
            seoulDate(a.events.starts_at).slice(0, 4) ===
              seoulDate().slice(0, 4),
        ).length,
        month_attendance: attendance.filter(
          (a: ClubRow) =>
            a.actual &&
            a.events &&
            new Date(a.events.starts_at) < new Date() &&
            seoulDate(a.events.starts_at).slice(0, 7) ===
              seoulDate().slice(0, 7),
        ).length,
        last_attended_at:
          attendance
            .filter(
              (a: ClubRow) =>
                a.actual &&
                a.events &&
                new Date(a.events.starts_at) < new Date(),
            )
            .map((a: ClubRow) => a.events.starts_at)
            .sort()
            .at(-1) || null,
        current_month_payment: payments[0] || null,
      },
      attendance,
      payments,
      uniform: {
        nickname: "스포트",
        number: "07",
        top_size: "100",
        bottom_size: "100",
      },
    };
  if (path === "name-requests" || path === "admin/name-requests") return [];
  if (path.startsWith("admin/guests/") && path.endsWith("/history"))
    return {
      guest_id: path.split("/")[2],
      applications: 2,
      total_visits: 1,
      last_visited_at: boot.events.at(-1)?.starts_at,
      recent: [],
    };
  if (path.startsWith("admin/guests/"))
    return guestRows.find((g) => g.id === path.split("/")[2]) || guestRows[0];
  if (path.startsWith("admin/guests")) {
    const params = new URL(path, "https://preview.invalid/").searchParams;
    let scoped = guestRows.filter(
      (g) => !params.get("event") || g.event_id === params.get("event"),
    );
    scoped = scoped.filter(
      (g) =>
        (!params.get("from") ||
          g.submitted_at.slice(0, 10) >= params.get("from")!) &&
        (!params.get("to") || g.submitted_at.slice(0, 10) <= params.get("to")!),
    );
    const paid = scoped.filter(
      (g) => g.guest_payments.status === "paid",
    ).length;
    const rows = scoped.filter(
      (g) =>
        !params.get("status") ||
        params.get("status") === "all" ||
        g.guest_payments.status === params.get("status"),
    );
    return {
      rows,
      total: rows.length,
      summary: {
        applications: scoped.length,
        paid,
        pending: scoped.length - paid,
      },
    };
  }
  if (path.startsWith("admin/member/")) {
    const selected =
      members.find((m) => m.id === path.split("/")[2]) || members[0];
    const summary = attendanceSummary(Number(seoulDate().slice(0, 4)));
    return {
      ...selected,
      attendance_count: summary.total_attendance,
      year_attendance: summary.year_attendance,
      last_attended: summary.last_attended_at,
      current_month_payment:
        allDues.find(
          (p: ClubRow) =>
            p.member_id === selected.id &&
            p.month.startsWith(seoulDate().slice(0, 7)),
        ) || null,
    };
  }
  if (path.startsWith("admin/members"))
    return { rows: members, total: members.length };
  if (path.startsWith("admin/applications"))
    return [
      {
        id: "application",
        name: "새회원",
        phone: "01000000000",
        status: "pending",
        answers: { position: "레프트", experience: "2년" },
        submitted_at: new Date().toISOString(),
      },
    ];
  if (path.startsWith("admin/analytics"))
    return {
      active_members: 36,
      new_members: 2,
      guest_applications: 24,
      paid_guests: 20,
      pending_guests: 2,
      pending_members: 1,
      unpaid_members: 3,
      unanswered: 5,
      payment_rate: 92,
      average_participants: 22,
      average_attendance: 2.5,
      return_rate: 41.7,
      monthly_members: [{ label: "10월", value: 2 }],
      monthly_average: [{ label: "10월", value: 22 }],
      monthly_participants: [{ label: "10월", value: 88 }],
      participant_ratio: [
        { label: "회원", value: 81.8 },
        { label: "게스트", value: 18.2 },
      ],
      inactive_members: [],
      new_guests: 14,
      returning_guests: 10,
      positions: [
        { label: "레프트", value: 12 },
        { label: "세터", value: 6 },
        { label: "센터", value: 4 },
        { label: "리베로", value: 2 },
      ],
      sources: [
        { label: "지인", value: 14 },
        { label: "Instagram", value: 8 },
        { label: "기타", value: 2 },
      ],
      experience: [
        { label: "1년 미만", value: 7 },
        { label: "1–3년", value: 12 },
        { label: "3년 이상", value: 5 },
      ],
      monthly: [
        { label: "6월", value: 12 },
        { label: "7월", value: 18 },
        { label: "8월", value: 16 },
        { label: "9월", value: 21 },
        { label: "10월", value: 24 },
      ],
      member_attendance: members.map((m, i) => ({
        ...m,
        label: m.name,
        value: 20 - i,
      })),
    };
  if (path.startsWith("admin/attendance")) {
    const eventAttendance = attendance.filter(
      (a: ClubRow) => a.event_id === query.get("event"),
    );
    const filtered = members.filter(
      (m) =>
        !query.get("response") ||
        query.get("response") === "all" ||
        (eventAttendance.find((a: ClubRow) => a.member_id === m.id)?.response ||
          "unanswered") === query.get("response"),
    );
    const page = Number(query.get("page") || 0);
    const visible = filtered.slice(page * 30, page * 30 + 30);
    return {
      event:
        boot.events.find((e: ClubRow) => e.id === query.get("event")) || event,
      members: visible,
      attendance: eventAttendance.filter((a: ClubRow) =>
        visible.some((m) => m.id === a.member_id),
      ),
      total: filtered.length,
      summary: {
        members: members.length,
        present: eventAttendance.filter((a: ClubRow) => a.actual === true)
          .length,
        absent: eventAttendance.filter((a: ClubRow) => a.actual === false)
          .length,
        unchecked:
          members.length -
          eventAttendance.filter((a: ClubRow) => a.actual != null).length,
      },
    };
  }
  if (path.startsWith("admin/dues"))
    return scopedDues.filter(
      (p: ClubRow) =>
        !query.get("status") ||
        query.get("status") === "all" ||
        p.status === query.get("status"),
    );
  if (path.startsWith("admin/notices")) return boot.announcements;
  if (path.startsWith("admin/questions")) return boot.questions;
  if (path.startsWith("admin/uniforms"))
    return [
      {
        member_id: member.id,
        members: member,
        nickname: "스포트",
        number: "07",
        top_size: "100",
        bottom_size: "100",
      },
    ];
  if (path.startsWith("admin/roster")) {
    const confirmed = guestRows
      .filter((g) => g.guest_payments.status === "paid")
      .map((g) => ({ name: g.guests.name, position: g.guests.position }));
    return {
      event,
      members: members.map(({ name, position }) => ({ name, position })),
      guests: guestRows
        .filter((g) => g.guest_payments.status === "paid")
        .map((g) => ({ name: g.guests.name, position: g.guests.position })),
      text: `[SpotLight 참가 명단 · 미리보기]\n회원 ${members.length}명\n게스트 ${confirmed.length}명\n총 ${members.length + confirmed.length}명\n\n[게스트]\n${confirmed.map((g, i) => `${i + 1}. ${g.name} / ${g.position}`).join("\n")}`,
    };
  }
  if (path === "notifications" && boot.role === "admin")
    return [
      {
        id: "guest-notification",
        title: `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date(event.starts_at))} 게스트 신청이 들어왔습니다.`,
        body: "신청 내용을 확인해주세요.",
        href: `/admin/guests?application=${guestRows[0].id}&event=${event.id}`,
        kind: "admin_application",
        read_at: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "roster-notification",
        title: "오늘 SpotLight 참가자 명단이 준비되었습니다.",
        body: "운영용 명단을 확인해주세요.",
        href: `/admin/roster?event=${event.id}`,
        kind: "admin_roster",
        read_at: null,
        created_at: new Date().toISOString(),
      },
    ];
  if (path === "notifications")
    return [
      {
        id: "notification",
        title: "SpotLight에 오신 것을 환영해요",
        body: "모든 표시 정보는 미리보기용입니다.",
        href: "/",
        read_at: null,
        created_at: new Date().toISOString(),
      },
    ];
  if (/^(videos|playlists)\//.test(path)) return { entry: null, event: null };
  if (path.startsWith("videos")) return { rows: [], total: 0 };
  return [];
}
