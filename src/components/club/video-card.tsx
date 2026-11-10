"use client";
import Link from "next/link";
import { ChevronRight, Play, Volleyball } from "lucide-react";
import { formatDate, videoCategories, type ClubRow } from "@/lib/domain";
import { Badge, useApp } from "./core";

export function VideoCard({ video }: { video: ClubRow }) {
  const { link } = useApp();
  const detail = link(`/${video.source || "videos"}/${video.id}`);
  const playlist =
    video.entry_type === "playlist" || (!video.video_id && video.playlist_id);
  return (
    <article className="video-card card">
      <Link
        className="video-thumbnail"
        href={detail}
        aria-label={`${video.title} 상세`}
      >
        {video.thumbnail ? (
          <img src={video.thumbnail} alt="" loading="lazy" />
        ) : (
          <Volleyball size={56} strokeWidth={1} />
        )}
        <span className="play-circle">
          <Play size={24} fill="currentColor" />
        </span>
        {playlist && <Badge>재생목록</Badge>}
      </Link>
      <div className="video-info">
        <Badge tone={video.kind}>{videoCategories[video.kind]}</Badge>
        <h3>
          <Link href={detail}>{video.title}</Link>
        </h3>
        <p>
          {videoCategories[video.kind]} ·{" "}
          {formatDate(video.filmed_on + "T12:00:00+09:00")}
          {video.date_source === "registered" ? " 등록" : ""}
        </p>
        {playlist && (
          <p>
            {video.video_count == null
              ? "영상 수 미등록"
              : `${video.video_count} Videos`}
          </p>
        )}
        <Link className="text-button" href={detail}>
          재생 <ChevronRight size={14} />
        </Link>
      </div>
    </article>
  );
}
