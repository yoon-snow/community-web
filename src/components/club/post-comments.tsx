"use client";
import { MessageCircle, Send, Pencil, Trash2, Check, X } from "lucide-react";
import { useState } from "react";
import { useApp, useResource, Resource, SaveForm, Avatar } from "./core";
import { formatDate, type ClubRow } from "@/lib/domain";
export function PostComments({
  post,
  parent,
}: {
  post: string;
  parent?: string;
}) {
  const { boot, mutate, toast } = useApp();
  const [page, setPage] = useState(0),
    [expanded, setExpanded] = useState(""),
    [editing, setEditing] = useState(""),
    [draft, setDraft] = useState("");
  const path = "post-comments/" + post;
  const comments = useResource(
    boot.member
      ? path + "?page=" + page + (parent ? "&parent=" + parent : "")
      : null,
  );
  if (!boot.member)
    return (
      <p className="micro">
        댓글은 승인된 회원이 로그인한 뒤 이용할 수 있어요.
      </p>
    );
  return (
    <section className={parent ? "reply-thread" : "post-comments"}>
      <h3>{parent ? "답글" : "댓글"}</h3>
      <SaveForm
        className="comment-compose"
        submit={
          <span
            role="img"
            aria-label={parent ? "답글 등록" : "댓글 등록"}
            title={parent ? "답글 등록" : "댓글 등록"}
          >
            <Send size={16} />
          </span>
        }
        onSubmit={async () => {
          await mutate(path, { body: draft, parent_id: parent });
          setPage(0);
          setDraft("");
        }}
      >
        <textarea
          aria-label={parent ? "답글 내용" : "댓글 내용"}
          required
          maxLength={1500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            parent ? "이 댓글에 답글을 남겨주세요" : "댓글을 남겨주세요"
          }
          rows={2}
        />
      </SaveForm>
      <Resource resource={comments}>
        {(d) => (
          <>
            {!d.rows.length && (
              <p className="micro">
                {parent ? "첫 답글을 남겨보세요." : "첫 댓글을 남겨보세요."}
              </p>
            )}
            {d.rows.map((c: ClubRow) => (
              <article className="post-comment" key={c.id}>
                <header className="comment-author">
                  <Avatar member={c.author || { name: "회원" }} />
                  <strong>{c.author?.name || "회원"}</strong>
                  {c.mine && <small>나</small>}
                  <time dateTime={c.created_at}>
                    {formatDate(c.created_at)}
                  </time>
                </header>
                {editing === c.id ? (
                  <SaveForm
                    className="comment-compose"
                    submit={
                      <span role="img" aria-label="수정 저장">
                        <Check size={16} />
                      </span>
                    }
                    onSubmit={async (f) => {
                      await mutate(
                        path,
                        { id: c.id, body: f.get("body") },
                        "PATCH",
                      );
                      setEditing("");
                    }}
                  >
                    <textarea
                      name="body"
                      aria-label="댓글 수정"
                      required
                      maxLength={1500}
                      defaultValue={c.body}
                    />
                    <button
                      type="button"
                      className="post-tool"
                      aria-label="수정 취소"
                      title="수정 취소"
                      onClick={() => setEditing("")}
                    >
                      <X size={16} />
                    </button>
                  </SaveForm>
                ) : (
                  <p>{c.body}</p>
                )}
                <div className="comment-tools">
                  {!parent && (
                    <button
                      className="post-tool"
                      aria-label="답글 보기 · 쓰기"
                      title="답글 보기 · 쓰기"
                      aria-expanded={expanded === c.id}
                      onClick={() => setExpanded(expanded === c.id ? "" : c.id)}
                    >
                      <MessageCircle size={15} />
                    </button>
                  )}
                  {c.mine && (
                    <button
                      className="post-tool"
                      aria-label="댓글 수정"
                      title="댓글 수정"
                      onClick={() => setEditing(c.id)}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {(c.mine || boot.role === "admin") && (
                    <button
                      className="post-tool danger-text"
                      aria-label="댓글 삭제"
                      title="댓글 삭제"
                      onClick={async () => {
                        if (!confirm("댓글을 삭제할까요?")) return;
                        try {
                          await mutate(path, { id: c.id }, "DELETE");
                          setPage(0);
                        } catch (e) {
                          toast((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {!parent && expanded === c.id && (
                  <PostComments key={c.id} post={post} parent={c.id} />
                )}
              </article>
            ))}
            <div className="button-row">
              {page > 0 && (
                <button onClick={() => setPage(page - 1)}>이전 댓글</button>
              )}
              {d.more && (
                <button onClick={() => setPage(page + 1)}>다음 댓글</button>
              )}
            </div>
          </>
        )}
      </Resource>
    </section>
  );
}
