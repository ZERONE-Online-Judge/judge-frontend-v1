import Select from '@/shared/ui/Select';
import { statementLanguageLabel } from '@/domains/problemManagement/statementLanguages';

export default function StatementLanguageSelect({
  languages,
  selected,
  defaultLanguage,
  onChange,
}: {
  languages: string[];
  selected: string;
  defaultLanguage: string;
  onChange: (language: string) => void;
}) {
  if (languages.length < 2) return null;
  return (
    <label className="mt-5 flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
      지문 언어
      <Select
        aria-label="지문 언어"
        className="max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
      >
        {languages.map((language) => (
          <option key={language} value={language}>
            {statementLanguageLabel(language)}
            {language === defaultLanguage ? ' · 기본' : ''}
          </option>
        ))}
      </Select>
    </label>
  );
}
