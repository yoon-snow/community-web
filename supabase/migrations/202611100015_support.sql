-- Mobile help center. Guest capabilities are checked by the server, never by a public lookup.
create table public.faq_categories (
 id text primary key, name text not null, icon text not null, sort_order int not null default 0, is_active boolean not null default true
);
create table public.inquiry_categories (id text primary key references public.faq_categories);
create table public.faqs (
 id uuid primary key default gen_random_uuid(), category_id text not null references public.faq_categories,
 question text not null, answer text not null, keywords text[] not null default '{}', sort_order int not null default 0,
 is_featured boolean not null default false, is_active boolean not null default true, view_count bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid references auth.users on delete set null
);
create table public.inquiry_notification_recipients (member_id uuid primary key references public.admins on delete cascade);
-- Initially route to the designated founding administrator only.
insert into public.inquiry_notification_recipients select a.member_id from public.admins a join public.members m on m.id=a.member_id
 where m.user_id='a0807d8a-8da8-4baa-abea-a43f9a2e9f77' and m.status='active';
create table public.inquiries (
 id uuid primary key default gen_random_uuid(), category_id text not null references public.inquiry_categories,
 faq_id uuid references public.faqs, faq_question text, faq_answer text,
 event_id uuid references public.events, guest_id uuid references public.guests, guest_application_id uuid references public.guest_applications,
 member_id uuid references public.members, guest_token_hash text, name text not null, phone text not null, title text not null,
 status text not null default 'NEW' check(status in ('NEW','IN_PROGRESS','RESOLVED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_reply_at timestamptz,
 check ((member_id is null) = (guest_token_hash is not null))
);
create index inquiries_updated on public.inquiries(updated_at desc);
create index inquiries_owner on public.inquiries(member_id,updated_at desc);
create table public.inquiry_messages (
 id uuid primary key default gen_random_uuid(), inquiry_id uuid not null references public.inquiries on delete cascade,
 sender text not null check(sender in ('guest','member','admin')), body text not null check(length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index inquiry_thread on public.inquiry_messages(inquiry_id,created_at);
create table public.inquiry_attachments (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.inquiry_messages on delete cascade,
 object_path text unique not null
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('inquiry-images','inquiry-images',false,1048576,array['image/jpeg','image/png','image/webp']);
create table private.support_limits (key text primary key, started_at timestamptz not null, uses int not null);
create function public.support_allow(p_key text,p_limit int) returns boolean language sql security definer set search_path='' as $$
 insert into private.support_limits as l values(p_key,now(),1) on conflict(key) do update set
 uses=case when l.started_at<now()-interval '1 hour' then 1 else l.uses+1 end,
 started_at=case when l.started_at<now()-interval '1 hour' then now() else l.started_at end returning uses<=p_limit;
$$;
create function public.support_view(p_id uuid) returns void language sql set search_path='' as $$
 update public.faqs set view_count=view_count+1 where id=p_id and is_active and exists(select 1 from public.faq_categories c where c.id=category_id and c.is_active);
$$;
-- Commit ticket, first message, attachments and notification outbox as a unit.
create function public.support_message(p_ticket uuid,p_new jsonb,p_sender text,p_body text,p_paths text[]) returns uuid
language plpgsql set search_path='' as $$
declare t public.inquiries; msg uuid; recipient uuid; q public.faqs;
begin
 if p_new is not null then
  if not exists(select 1 from public.faq_categories where id=p_new->>'category_id' and is_active) then raise exception 'invalid category'; end if;
  if p_new->>'faq_id' is not null then
   select * into strict q from public.faqs where id=(p_new->>'faq_id')::uuid and category_id=p_new->>'category_id' and is_active;
  end if;
  insert into public.inquiries(id,category_id,faq_id,faq_question,faq_answer,event_id,guest_id,guest_application_id,member_id,guest_token_hash,name,phone,title)
  values(p_ticket,p_new->>'category_id',q.id,q.question,q.answer,(p_new->>'event_id')::uuid,(p_new->>'guest_id')::uuid,
   (p_new->>'guest_application_id')::uuid,(p_new->>'member_id')::uuid,p_new->>'guest_token_hash',p_new->>'name',p_new->>'phone',p_new->>'title') returning * into t;
 else
  update public.inquiries set updated_at=now(), status=case when p_sender='admin' then 'RESOLVED' else 'IN_PROGRESS' end,
   last_reply_at=case when p_sender='admin' then now() else last_reply_at end where id=p_ticket returning * into strict t;
 end if;
 insert into public.inquiry_messages(inquiry_id,sender,body) values(t.id,p_sender,p_body) returning id into msg;
 if cardinality(p_paths)+(select count(*) from public.inquiry_attachments a join public.inquiry_messages m on m.id=a.message_id where m.inquiry_id=t.id)>3 then raise exception 'support_image_limit'; end if;
 insert into public.inquiry_attachments(message_id,object_path) select msg,unnest(p_paths);
 if p_new is not null then
  for recipient in select m.user_id from public.inquiry_notification_recipients r join public.members m on m.id=r.member_id where m.status='active' loop
   perform private.notify(recipient,'새 문의가 도착했습니다.',left(t.name,1)||'○○ · '||(select name from public.faq_categories where id=t.category_id),'/admin/support/'||t.id,'admin_inquiry','inquiry:'||t.id);
  end loop;
 elsif p_sender='admin' and t.member_id is not null then
  select user_id into recipient from public.members where id=t.member_id and status='active';
  if recipient is not null then perform private.notify(recipient,'문의에 답변이 도착했습니다.','내 문의에서 답변을 확인해주세요.','/support/'||t.id,'inquiry_reply','inquiry_reply:'||msg); end if;
 end if;
 return msg;
end; $$;
-- The only callers of privileged write functions are authenticated server handlers.
alter function public.support_message(uuid,jsonb,text,text,text[]) security definer;
revoke all on function public.support_allow(text,int),public.support_view(uuid),public.support_message(uuid,jsonb,text,text,text[]) from public,anon,authenticated;
grant execute on function public.support_allow(text,int),public.support_view(uuid),public.support_message(uuid,jsonb,text,text,text[]) to service_role;
do $$declare n text; begin
 foreach n in array array['faqs','faq_categories','inquiries','inquiry_categories','inquiry_messages','inquiry_attachments','inquiry_notification_recipients'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant all on public.%I to service_role',n);
 end loop;
end $$;
grant select on public.faq_categories to anon,authenticated;
grant select(id,category_id,question,answer,keywords,sort_order,is_featured,is_active,view_count) on public.faqs to anon,authenticated;
create policy visible_categories on public.faq_categories for select using(is_active);
create policy visible_faqs on public.faqs for select using(is_active and exists(select 1 from public.faq_categories c where c.id=category_id and c.is_active));
grant select(id,category_id,faq_id,event_id,member_id,title,status,created_at,updated_at,last_reply_at) on public.inquiries to authenticated;
create policy own_inquiry on public.inquiries for select to authenticated using(member_id=private.my_member_id() or private.is_admin());
grant select on public.inquiry_messages to authenticated;
create policy own_thread on public.inquiry_messages for select to authenticated using(exists(select 1 from public.inquiries i where i.id=inquiry_id));
insert into public.faq_categories select * from jsonb_populate_recordset(null::public.faq_categories,'[
 {"id": "guest", "name": "게스트 신청", "icon": "🏐", "sort_order": 0, "is_active": true},
 {"id": "payment", "name": "게스트비 / 입금", "icon": "₩", "sort_order": 1, "is_active": true},
 {"id": "schedule", "name": "운동 일정", "icon": "◷", "sort_order": 2, "is_active": true},
 {"id": "venue", "name": "장소", "icon": "⌖", "sort_order": 3, "is_active": true},
 {"id": "join", "name": "회원가입", "icon": "＋", "sort_order": 4, "is_active": true},
 {"id": "dues", "name": "회비", "icon": "₩", "sort_order": 5, "is_active": true},
 {"id": "attendance", "name": "출석", "icon": "✓", "sort_order": 6, "is_active": true},
 {"id": "video", "name": "영상", "icon": "▷", "sort_order": 7, "is_active": true},
 {"id": "uniform", "name": "유니폼", "icon": "♢", "sort_order": 8, "is_active": true},
 {"id": "other", "name": "기타", "icon": "…", "sort_order": 9, "is_active": true}
]');
insert into public.inquiry_categories select id from public.faq_categories;
insert into public.faqs(id,category_id,question,answer,keywords,sort_order,is_featured) select id,category_id,question,answer,keywords,sort_order,is_featured from jsonb_populate_recordset(null::public.faqs,'[
 {"id": "00000000-0000-4000-8000-000000000001", "category_id": "guest", "question": "게스트 신청은 어떻게 하나요?", "answer": "일정에서 원하는 운동을 선택하고 ‘공지 확인하고 게스트 신청’을 누르세요. 참가 안내를 읽은 뒤 신청서를 제출하면 됩니다.", "keywords": ["신청", "비회원"], "sort_order": 0, "is_featured": true, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000002", "category_id": "guest", "question": "신청 후 취소할 수 있나요?", "answer": "취소를 원하시면 아래 ‘추가 문의하기’에서 신청한 운동을 알려주세요. 운영진이 신청 상태를 확인하고 안내해 드립니다.", "keywords": ["취소", "환불"], "sort_order": 1, "is_featured": true, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000003", "category_id": "guest", "question": "당일 신청도 가능한가요?", "answer": "해당 일정에서 게스트 신청 버튼이 열려 있는지 확인해주세요. 버튼이 닫혀 있으면 운영진에게 문의해주세요.", "keywords": ["당일", "마감"], "sort_order": 2, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000011", "category_id": "payment", "question": "게스트비는 얼마인가요?", "answer": "정기 게임데이는 5,000원, 레슨데이는 15,000원입니다. 신청할 운동의 상세 화면에서 해당 일정에 적용되는 금액을 확인해주세요.", "keywords": ["금액", "비용", "입금"], "sort_order": 10, "is_featured": true, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000012", "category_id": "payment", "question": "입금 계좌는 어디서 확인하나요?", "answer": "게스트 신청 마지막 단계와 접수 완료 화면에서 계좌와 예금주를 확인할 수 있어요. 신청자 이름으로 입금해주세요.", "keywords": ["은행", "계좌번호", "송금"], "sort_order": 11, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000013", "category_id": "payment", "question": "입금 여부는 어떻게 확인하나요?", "answer": "운영진이 실제 입금 내역을 확인하면 입금완료로 변경됩니다. 확인이 필요하면 신청한 운동을 선택해 추가 문의해주세요.", "keywords": ["확인", "언제", "입금"], "sort_order": 12, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000021", "category_id": "schedule", "question": "운동 일정은 어디서 확인하나요?", "answer": "하단 ‘일정’에서 날짜를 누르면 운동 시간과 장소를 확인할 수 있어요.", "keywords": ["캘린더", "시간"], "sort_order": 20, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000022", "category_id": "schedule", "question": "운동이 취소되면 어떻게 알 수 있나요?", "answer": "출발 전 일정 상세의 상태와 홈의 긴급공지를 확인해주세요.", "keywords": ["취소", "휴강"], "sort_order": 21, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000031", "category_id": "venue", "question": "운동 장소는 어디인가요?", "answer": "정기 운동 장소는 광명동초등학교입니다. 변경될 수 있으니 운동 당일 일정 상세에서 장소를 확인해주세요.", "keywords": ["주소", "체육관", "변경"], "sort_order": 30, "is_featured": true, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000041", "category_id": "join", "question": "회원가입은 어떻게 하나요?", "answer": "계정을 만들고 이메일을 인증한 뒤 회원가입 신청서를 제출해주세요. 운영진 승인 후 회원 메뉴를 이용할 수 있어요.", "keywords": ["가입", "승인"], "sort_order": 40, "is_featured": true, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000051", "category_id": "dues", "question": "회비 납부 여부는 어디서 확인하나요?", "answer": "로그인 후 내 정보에서 회비 내역을 열면 월별 납부 상태를 확인할 수 있어요.", "keywords": ["납부", "미납", "면제"], "sort_order": 50, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000061", "category_id": "attendance", "question": "참석 응답과 실제 출석은 어떻게 다른가요?", "answer": "참석 응답은 운동 전 참여 의사예요. 실제 출석은 운동이 끝난 뒤 운영진이 확정하며 출석 메뉴에서 확인할 수 있어요.", "keywords": ["불참", "출석부"], "sort_order": 60, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000071", "category_id": "video", "question": "영상은 누가 볼 수 있나요?", "answer": "승인된 회원과 운영진이 로그인한 후 영상을 볼 수 있어요.", "keywords": ["재생목록", "권한"], "sort_order": 70, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000072", "category_id": "video", "question": "영상이 재생되지 않아요.", "answer": "회원 계정으로 로그인했는지 확인하고 영상을 다시 열어보세요. 문제가 계속되면 영상 제목과 오류 화면을 보내주세요.", "keywords": ["오류", "재생"], "sort_order": 71, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000081", "category_id": "uniform", "question": "유니폼은 어떻게 문의하나요?", "answer": "추가 문의에 원하는 품목과 사이즈를 적어주시면 운영진이 확인합니다.", "keywords": ["사이즈", "주문"], "sort_order": 80, "is_featured": false, "is_active": true, "view_count": 0},
 {"id": "00000000-0000-4000-8000-000000000091", "category_id": "other", "question": "찾는 질문이 없어요.", "answer": "추가 문의에 궁금한 내용을 남겨주세요. 회원은 내 문의에서, 게스트는 접수 후 발급된 전용 링크에서 답변을 확인할 수 있어요.", "keywords": ["기타", "운영진"], "sort_order": 90, "is_featured": false, "is_active": true, "view_count": 0}
]');
