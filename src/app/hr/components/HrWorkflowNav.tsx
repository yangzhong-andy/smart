import Link from "next/link";

export function HrWorkflowNav({ active }: { active: "employees" | "payroll" }) {
  return (
    <nav aria-label="人员与工资管理" className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-2">
      {[
        { key: "employees", href: "/hr/employees", label: "员工入职与档案" },
        { key: "payroll", href: "/hr/payroll", label: "每月发工资" },
      ].map((item) => (
        <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm ${active === item.key ? "bg-primary-500 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
