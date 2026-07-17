import { useState, useRef, useEffect } from 'react';
import { User, UserSettings } from '../types';
import { useLocale, LOCALE_OPTIONS } from '../i18n';
import SettingsDialog from './SettingsDialog';

interface Props {
  user: User;
  userSettings: UserSettings;
  isDriveAuthorizing: boolean;
  onToggleDrive: () => void;
  onLogout: () => void;
}

/** Menu tài khoản gọn: profile + Cài đặt (mở dialog) + ngôn ngữ + đăng xuất. */
const UserMenu = ({ user, userSettings, isDriveAuthorizing, onToggleDrive, onLogout }: Props) => {
  const { t, locale, setLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 bg-white p-2 pr-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all animate-in slide-in-from-right-4 duration-500"
      >
        <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-xl" />
        <span className="hidden sm:block text-[10px] font-black text-slate-800 leading-none">
          {user.name}
        </span>
        <i className={`fas fa-chevron-down text-[8px] text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 overflow-hidden">
          {/* Profile */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <img src={user.picture} alt="" className="w-10 h-10 rounded-xl" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{user.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Cài đặt */}
          <div className="p-2 border-b border-slate-100">
            <button
              onClick={() => { setIsOpen(false); setShowSettings(true); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              <i className="fas fa-gear"></i>
              {t.settingsMenu}
              <i className="fas fa-chevron-right text-[9px] text-slate-300 ml-auto"></i>
            </button>
          </div>

          {/* Ngôn ngữ nhanh */}
          <div className="p-3 border-b border-slate-100">
            <div className="flex gap-1.5">
              {LOCALE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setLocale(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                    locale === opt.value
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-sm">{opt.flag}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Logout */}
          <div className="p-2">
            <button
              onClick={() => { setIsOpen(false); onLogout(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <i className="fas fa-sign-out-alt"></i>
              {t.logout}
            </button>
          </div>
        </div>
      )}

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        userSettings={userSettings}
        isDriveAuthorizing={isDriveAuthorizing}
        onToggleDrive={onToggleDrive}
      />
    </div>
  );
};

export default UserMenu;
