export async function guestImages(
  rows: {
    name: string;
    position: string;
    birth_date?: string;
    experience?: string;
  }[],
) {
  const files: File[] = [];
  await document.fonts.ready;
  for (let start = 0; start < rows.length; start += 12) {
    const group = rows.slice(start, start + 12);
    const canvas = document.createElement("canvas");
    canvas.width = 760;
    canvas.height = 174 + group.length * 118;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지를 만들 수 없어요.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 760, canvas.height);
    ctx.fillStyle = "#0F1F3D";
    ctx.fillRect(0, 0, 760, 118);
    ctx.fillStyle = "#E4C968";
    ctx.font = "bold 19px sans-serif";
    ctx.fillText("SPOTLIGHT VOLLEYBALL CLUB", 32, 38);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText("운영진용 게스트 명단", 32, 88);
    ctx.font = "22px sans-serif";
    ctx.fillText(
      files.length + 1 + " / " + Math.ceil(rows.length / 12),
      640,
      85,
    );
    group.forEach((row, i) => {
      const y = 163 + i * 118;
      ctx.fillStyle = "#101828";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(row.name || "이름 미입력", 32, y, 320);
      ctx.fillStyle = "#475467";
      ctx.font = "24px sans-serif";
      ctx.fillText(row.position || "미정", 390, y, 330);
      ctx.font = "21px sans-serif";
      ctx.fillText("생년월일 " + (row.birth_date || "미입력"), 32, y + 34, 690);
      ctx.fillText(
        "배구 경력 " + (row.experience || "미입력"),
        32,
        y + 65,
        690,
      );
      ctx.strokeStyle = "#d9e0e9";
      ctx.beginPath();
      ctx.moveTo(32, y + 85);
      ctx.lineTo(728, y + 85);
      ctx.stroke();
    });
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("이미지 생성 실패"))),
        "image/png",
      ),
    );
    files.push(
      new File([blob], "spotlight-guests-" + (files.length + 1) + ".png", {
        type: "image/png",
      }),
    );
  }
  return files;
}
