"use client";
import { useState } from "react";
import { useApp, useResource, Resource, SaveForm } from "./core";
import { formatDate, type ClubRow } from "@/lib/domain";
export function PostComments({ post }: { post: string }) {
  const { boot, mutate, toast } = useApp();
  const [page, setPage] = useState(0),
    [editing, setEditing] = useState(""),
    [draft, setDraft] = useState("");
  const path = "post-comments/" + post;
  const comments = useResource(boot.member ? path + "?page=" + page : null);
  if (!boot.member)
    return (
      <p className="micro">
        댓글은 승인된 회원이 로그인한 뒤 이용할 수 있어요.
      </p>
    );
  return (
    <section className="post-comments">
      <h3>댓글</h3>
      <SaveForm
        submit="댓글 등록"
        onSubmit={async () => {
          await mutate(path, { body: draft });
          setPage(0);
          setDraft("");
        }}
      >
        <textarea
          aria-label="댓글 내용"
          required
          maxLength={1500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="댓글을 남겨주세요"
          rows={2}
        />
      </SaveForm>
      <Resource resource={comments}>
        {(d) => (
          <>
            {!d.rows.length && <p className="micro">첫 댓글을 남겨보세요.</p>}
            {d.rows.map((c: ClubRow) => (
              <article className="post-comment" key={c.id}>
                <small>
                  {c.mine ? "내 댓글" : "회원 댓글"} ·{" "}
                  {formatDate(c.created_at)}
                </small>
                {editing === c.id ? (
                  <SaveForm
                    submit="수정 저장"
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
                    <button type="button" onClick={() => setEditing("")}>
                      취소
                    </button>
                  </SaveForm>
                ) : (
                  <p>{c.body}</p>
                )}
                <div className="button-row">
                  {c.mine && (
                    <button
                      className="text-button"
                      onClick={() => setEditing(c.id)}
                    >
                      수정
                    </button>
                  )}
                  {(c.mine || boot.role === "admin") && (
                    <button
                      className="text-button"
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
                      삭제
                    </button>
                  )}
                </div>
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
