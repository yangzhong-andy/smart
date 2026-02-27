import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

/** 单子表解析结果：表头 + 行数据（每行为对象，键为表头） */
export type SheetResult = {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

/** POST：上传 xlsx，解析所有子表，返回子表列表及每个子表的表头+数据预览 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "请选择要上传的 xlsx 文件（form 字段名：file）" },
        { status: 400 }
      );
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "仅支持 .xlsx 或 .xls 格式" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

    const sheetNames = workbook.SheetNames || [];
    if (sheetNames.length === 0) {
      return NextResponse.json(
        { error: "表格中没有任何子表" },
        { status: 400 }
      );
    }

    const sheets: SheetResult[] = sheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        return {
          sheetName,
          headers: [],
          rows: [],
          rowCount: 0,
        };
      }
      // 第一行作为表头，header:1 返回二维数组
      const raw = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd",
      });
      const rows: unknown[][] = Array.isArray(raw) ? (raw as unknown[][]) : [];
      const headers =
        rows.length > 0
          ? (rows[0] as unknown[]).map((c) =>
              c != null ? String(c).trim() : ""
            )
          : [];
      const dataRows = rows.slice(1);
      const rowsAsObjects: Record<string, unknown>[] = dataRows.map((row) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          const val = row[i];
          obj[h || `列${i + 1}`] = val;
        });
        return obj;
      });

      return {
        sheetName,
        headers,
        rows: rowsAsObjects,
        rowCount: rowsAsObjects.length,
      };
    });

    return NextResponse.json({
      fileName: file.name,
      sheetNames,
      sheets,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "解析表格失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
