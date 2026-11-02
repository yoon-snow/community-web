import { z } from "zod";

export const authEmail = z
  .string()
  .trim()
  .email("이메일 주소를 확인해주세요.")
  .max(254)
  .transform((value) => value.toLowerCase());
export const newPassword = z
  .string()
  .min(12, "비밀번호는 12자 이상 입력해주세요.")
  .max(128, "비밀번호는 128자 이하로 입력해주세요.");
export const signInInput = z.object({
  email: authEmail,
  password: z.string().min(1, "비밀번호를 입력해주세요.").max(1024),
});
export const signUpInput = z
  .object({
    email: authEmail,
    password: newPassword,
    password_confirm: z.string(),
  })
  .refine(
    (input) => input.password === input.password_confirm,
    "비밀번호가 서로 다릅니다.",
  );
export const updatePasswordInput = z
  .object({ password: newPassword, password_confirm: z.string() })
  .refine(
    (input) => input.password === input.password_confirm,
    "비밀번호가 서로 다릅니다.",
  );
export function accountDestination(who: { admin?: boolean; member?: unknown }) {
  return who.admin ? "/admin" : who.member ? "/" : "/join";
}
