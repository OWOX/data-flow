import { FolderOpen, LogOut } from "lucide-react";

export function AccountPanel({
  email,
  onMyModels,
  onSignOut,
}: {
  email: string;
  onMyModels(): void;
  onSignOut(): void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Avatar + email */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#1e88e5] text-[18px] font-semibold text-white">
          {email.trim().charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-[14px] font-medium text-slate-900 break-all">{email}</div>
          <div className="text-[12px] text-slate-400">Signed in</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onMyModels}
          className="flex w-full items-center gap-2.5 rounded-lg border border-[#d8dee8] bg-white px-4 py-2.5 text-[14px] font-[550] text-slate-900 hover:bg-[#f1f3f7] cursor-pointer"
        >
          <FolderOpen size={16} className="flex-shrink-0 text-slate-500" />
          My Models
        </button>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg border border-[#d8dee8] bg-white px-4 py-2.5 text-[14px] font-[550] text-slate-900 hover:bg-[#f1f3f7] cursor-pointer"
        >
          <LogOut size={16} className="flex-shrink-0 text-slate-500" />
          Sign out
        </button>
      </div>
    </div>
  );
}
