"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { zhCN } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { format, parse, isValid } from "date-fns";

type DateInputProps = {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
};

export default function DateInput({
  value,
  onChange,
  id,
  className = "",
  placeholder = "选择日期",
  min,
  max,
  disabled = false,
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const [inputStr, setInputStr] = useState(value || "");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const minDate = min ? parse(min, "yyyy-MM-dd", new Date()) : undefined;
  const maxDate = max ? parse(max, "yyyy-MM-dd", new Date()) : undefined;

  useEffect(() => {
    setInputStr(value || "");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const str = format(date, "yyyy-MM-dd");
    onChange(str);
    setInputStr(str);
    setOpen(false);
  };

  const handleToday = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    onChange(today);
    setInputStr(today);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setInputStr("");
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputStr(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const d = parse(v, "yyyy-MM-dd", new Date());
      if (isValid(d)) onChange(v);
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <input
        id={id}
        type="text"
        value={inputStr}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
      />
      {open && !disabled && (
        <div
          className="absolute z-50 mt-1 rounded-lg border border-slate-700 bg-slate-800 p-3 shadow-xl"
          style={{ minWidth: "280px" }}
        >
          <DayPicker
            mode="single"
            locale={zhCN}
            weekStartsOn={1}
            selected={selectedDate}
            onSelect={handleSelect}
            defaultMonth={selectedDate || new Date()}
            disabled={{ before: minDate, after: maxDate }}
            classNames={{
              root: "rdp-cn",
              month: "space-y-3",
              month_caption: "flex justify-between items-center px-1 text-slate-200",
              nav: "flex gap-1",
              nav_button: "rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
              weekdays: "flex",
              weekday: "w-9 text-center text-xs text-slate-500",
              week: "flex",
              day: "w-9 h-9 text-center text-sm",
              day_button:
                "w-9 h-9 rounded-full text-slate-200 hover:bg-slate-600 focus:bg-cyan-600 focus:text-white",
              selected: "!bg-cyan-600 !text-white",
              today: "font-semibold text-cyan-400",
              outside: "text-slate-600",
              disabled: "text-slate-600 opacity-50",
            }}
          />
          <div className="mt-2 flex justify-between border-t border-slate-700 pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              清除
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
