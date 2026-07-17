import { useState, useRef, useEffect } from 'react';
import { User, UserSettings } from '../types';
import { apiKeyService } from '../services/apiKeyService';
import { translateKeyService } from '../services/translateKeyService';
import { useLocale, LOCALE_OPTIONS } from '../i18n';
import EncryptionSettings from './EncryptionSettings';

interface Props {
  user: User;
  userSettings: UserSettings;
  isDriveAuthorizing: boolean;
  onToggleDrive: () => void;
  onLogout: () => void;
}

const UserMenu = ({ user, userSettings, isDriveAuthorizing, onToggleDrive, onLogout }: Props) => {
  const { t, locale, setLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [geminiKeys, setGeminiKeys] = useState<string[]>([]);
  const [showKeys, setShowKeys] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [gtKeyDraft, setGtKeyDraft] = useState('');
  const [showGtKey, setShowGtKey] = useState(false);
  const [gtKeySaved, setGtKeySaved] = useState(false);
  const [showGtSetup, setShowGtSetup] = useState(false);
  const [showGeminiSetup, setShowGeminiSetup] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = apiKeyService.getKeys();
    setGeminiKeys(saved.length > 0 ? saved : ['']);
    setGtKeyDraft(translateKeyService.getKey());
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateKey = (index: number, value: string) => {
    const updated = [...geminiKeys];
    updated[index] = value;
    setGeminiKeys(updated);
    setKeySaved(false);
  };

  const addKey = () => {
    setGeminiKeys([...geminiKeys, '']);
  };

  const removeKey = (index: number) => {
    const updated = geminiKeys.filter((_, i) => i !== index);
    setGeminiKeys(updated.length > 0 ? updated : ['']);
    apiKeyService.setKeys(updated);
    apiKeyService.clearKeyError(index);
  };

  const saveKeys = () => {
    apiKeyService.setKeys(geminiKeys);
    setKeySaved(true);
    // Refresh from storage to reflect cleaned state
    const saved = apiKeyService.getKeys();
    setGeminiKeys(saved.length > 0 ? saved : ['']);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const clearAll = () => {
    apiKeyService.clearKeys();
    setGeminiKeys(['']);
    setKeySaved(false);
  };

  const activeIndex = apiKeyService.getCurrentIndex();
  const hasKeys = apiKeyService.hasUserKeys();
  const validKeyCount = geminiKeys.filter(k => k.trim()).length;
  // Poll error version to trigger re-render when keys fail at runtime
  const [, setErrorTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setErrorTick(apiKeyService.getKeyErrorVersion() + translateKeyService.getErrorVersion());
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  const keyErrors = apiKeyService.getKeyErrors();
  const hasGtKey = translateKeyService.hasKey();
  const gtError = translateKeyService.getError();

  const saveGtKey = () => {
    translateKeyService.setKey(gtKeyDraft);
    setGtKeySaved(true);
    setGtKeyDraft(translateKeyService.getKey());
    setTimeout(() => setGtKeySaved(false), 2000);
  };

  const clearGtKey = () => {
    translateKeyService.clearKey();
    setGtKeyDraft('');
    setGtKeySaved(false);
  };

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
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 overflow-hidden max-h-[80vh] overflow-y-auto custom-scrollbar">
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

          {/* Google Drive toggle */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <i className="fab fa-google-drive text-indigo-500 text-sm"></i>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">{t.googleDrive}</p>
                  <p className="text-[10px] text-slate-400">
                    {userSettings.driveEnabled ? t.driveAutoSave : t.driveSaveAudio}
                  </p>
                </div>
              </div>
              <button
                onClick={onToggleDrive}
                disabled={isDriveAuthorizing}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                  userSettings.driveEnabled ? 'bg-indigo-500' : 'bg-slate-200'
                } ${isDriveAuthorizing ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    userSettings.driveEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* End-to-end encryption */}
          <EncryptionSettings userSettings={userSettings} />

          {/* Language selector */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                  <i className="fas fa-language text-violet-500 text-sm"></i>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">{t.language}</p>
                  <p className="text-[10px] text-slate-400">
                    {LOCALE_OPTIONS.find(o => o.value === locale)?.label}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 mt-3">
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

          {/* Gemini API Keys */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <i className="fas fa-key text-amber-500 text-sm"></i>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">{t.geminiApiKeys}</p>
                  <p className="text-[10px] text-slate-400">
                    {hasKeys
                      ? t.keyCount(apiKeyService.getKeys().length, activeIndex + 1)
                      : t.usingDefaultKey}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowKeys(!showKeys)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <i className={`fas ${showKeys ? 'fa-eye-slash' : 'fa-eye'} text-[10px]`}></i>
              </button>
            </div>

            <div className="space-y-2">
              {geminiKeys.map((key, i) => {
                const error = keyErrors.get(i);
                return (
                  <div key={i}>
                    <div className="flex gap-1.5 items-center">
                      <span className={`text-[9px] font-black w-4 text-center shrink-0 ${
                        error
                          ? 'text-red-400'
                          : hasKeys && i === activeIndex
                            ? 'text-emerald-500'
                            : 'text-slate-300'
                      }`}>
                        {error
                          ? <i className="fas fa-exclamation-triangle text-[7px]"></i>
                          : hasKeys && i === activeIndex
                            ? <i className="fas fa-circle text-[6px]"></i>
                            : (i + 1)}
                      </span>
                      <input
                        type={showKeys ? 'text' : 'password'}
                        value={key}
                        onChange={(e) => updateKey(i, e.target.value)}
                        placeholder="AIza..."
                        className={`flex-1 min-w-0 px-2.5 py-1.5 text-[11px] rounded-lg focus:outline-none font-mono ${
                          error
                            ? 'bg-red-50 border border-red-200 focus:border-red-400 focus:ring-1 focus:ring-red-100'
                            : 'bg-slate-50 border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-100'
                        }`}
                      />
                      {geminiKeys.length > 1 && (
                        <button
                          onClick={() => removeKey(i)}
                          className="text-slate-300 hover:text-red-400 p-0.5 shrink-0"
                        >
                          <i className="fas fa-times text-[9px]"></i>
                        </button>
                      )}
                    </div>
                    {error && (
                      <div className="ml-5 mt-1 flex items-center gap-1.5">
                        <span className="text-[9px] font-bold text-red-400">{error}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={addKey}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold transition-colors border border-slate-200"
              >
                <i className="fas fa-plus mr-1"></i> {t.addKey}
              </button>
              <button
                onClick={saveKeys}
                disabled={validKeyCount === 0 && !hasKeys}
                className="flex-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold transition-colors"
              >
                {keySaved ? t.saved : `${t.saveKeys} ${validKeyCount > 0 ? `(${validKeyCount})` : ''}`}
              </button>
              {hasKeys && (
                <button
                  onClick={clearAll}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-400 rounded-lg text-[10px] font-bold transition-colors"
                >
                  {t.delete}
                </button>
              )}
            </div>

            <button
              onClick={() => setShowGeminiSetup(!showGeminiSetup)}
              className="mt-3 text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1.5"
            >
              <i className={`fas fa-chevron-${showGeminiSetup ? 'up' : 'down'} text-[8px]`}></i>
              {t.geminiSetupGuide}
            </button>

            {showGeminiSetup && (
              <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <ol className="space-y-1.5 text-[10px] text-slate-600 list-decimal list-inside leading-relaxed">
                  <li>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-600 hover:underline"
                    >
                      {t.geminiStep1} <i className="fas fa-external-link-alt text-[8px] ml-0.5"></i>
                    </a>
                  </li>
                  <li>{t.geminiStep2}</li>
                  <li>{t.geminiStep3}</li>
                </ol>
                <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">{t.geminiFreeTierNote}</p>
              </div>
            )}
          </div>

          {/* Google Translate API Key */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <i className="fas fa-language text-emerald-500 text-sm"></i>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">{t.gtKeyTitle}</p>
                  <p className="text-[10px] text-slate-400">
                    {hasGtKey ? t.gtKeyHint : t.gtKeyNotConfigured}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGtKey(!showGtKey)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <i className={`fas ${showGtKey ? 'fa-eye-slash' : 'fa-eye'} text-[10px]`}></i>
              </button>
            </div>

            <div className="flex gap-1.5 items-center">
              <span className={`text-[9px] font-black w-4 text-center shrink-0 ${
                gtError ? 'text-red-400' : (hasGtKey ? 'text-emerald-500' : 'text-slate-300')
              }`}>
                {gtError
                  ? <i className="fas fa-exclamation-triangle text-[7px]"></i>
                  : (hasGtKey ? <i className="fas fa-circle text-[6px]"></i> : <i className="fas fa-minus text-[8px]"></i>)}
              </span>
              <input
                type={showGtKey ? 'text' : 'password'}
                value={gtKeyDraft}
                onChange={(e) => { setGtKeyDraft(e.target.value); setGtKeySaved(false); }}
                placeholder={t.gtPlaceholder}
                className={`flex-1 min-w-0 px-2.5 py-1.5 text-[11px] rounded-lg focus:outline-none font-mono ${
                  gtError
                    ? 'bg-red-50 border border-red-200 focus:border-red-400 focus:ring-1 focus:ring-red-100'
                    : 'bg-slate-50 border border-slate-200 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100'
                }`}
              />
            </div>

            {gtError && (
              <div className="ml-5 mt-1">
                <span className="text-[9px] font-bold text-red-400">{gtError}</span>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={saveGtKey}
                disabled={!gtKeyDraft.trim() && !hasGtKey}
                className="flex-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold transition-colors"
              >
                {gtKeySaved ? t.saved : t.saveKeys}
              </button>
              {hasGtKey && (
                <button
                  onClick={clearGtKey}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-400 rounded-lg text-[10px] font-bold transition-colors"
                >
                  {t.delete}
                </button>
              )}
            </div>

            <button
              onClick={() => setShowGtSetup(!showGtSetup)}
              className="mt-3 text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1.5"
            >
              <i className={`fas fa-chevron-${showGtSetup ? 'up' : 'down'} text-[8px]`}></i>
              {t.gtSetupGuide}
            </button>

            {showGtSetup && (
              <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <ol className="space-y-1.5 text-[10px] text-slate-600 list-decimal list-inside leading-relaxed">
                  <li>
                    <a
                      href="https://console.cloud.google.com/apis/library/translate.googleapis.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:underline"
                    >
                      {t.gtStep1} <i className="fas fa-external-link-alt text-[8px] ml-0.5"></i>
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:underline"
                    >
                      {t.gtStep2} <i className="fas fa-external-link-alt text-[8px] ml-0.5"></i>
                    </a>
                  </li>
                  <li>{t.gtStep3}</li>
                  <li>{t.gtStep4}</li>
                </ol>
                <p className="mt-2 text-[10px] font-bold text-amber-600 leading-relaxed">{t.gtSecurityWarn}</p>
              </div>
            )}
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
    </div>
  );
};

export default UserMenu;
