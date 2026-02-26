import { describe, test, expect } from "vitest";
import {
  identifyTableTypeFromTitle,
  parseFxQuantity,
  parseFxRate,
  parsePointQuantity,
  parsePointRate,
} from "./portfolio.js";

describe("identifyTableTypeFromTitle", () => {
  test("「ポイント・マイル」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("ポイント・マイル")).toBe("ポイント・マイル");
  });

  test("「年金」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("年金")).toBe("年金");
  });

  test("「保険」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("保険")).toBe("保険");
  });

  test("「預金・現金・暗号資産」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("預金・現金・暗号資産")).toBe("預金・現金・暗号資産");
  });

  test("「株式(現物)」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("株式(現物)")).toBe("株式(現物)");
  });

  test("「投資信託」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("投資信託")).toBe("投資信託");
  });

  test("不明なタイトルは「不明」を返す", () => {
    expect(identifyTableTypeFromTitle("")).toBe("不明");
    expect(identifyTableTypeFromTitle("不明なカテゴリ")).toBe("不明");
    expect(identifyTableTypeFromTitle("ポイント")).toBe("不明"); // "ポイント・マイル"ではない
  });
});

describe("parseFxQuantity", () => {
  test("買建は正数で数量を返す", () => {
    expect(parseFxQuantity("買\n10000")).toBe(10000);
  });

  test("売建は負数で数量を返す", () => {
    expect(parseFxQuantity("売\n12,000")).toBe(-12000);
  });

  test("数量がない場合は undefined", () => {
    expect(parseFxQuantity("")).toBeUndefined();
    expect(parseFxQuantity("買")).toBeUndefined();
  });
});

describe("parseFxRate", () => {
  test("レート+日時から先頭のレートを抽出", () => {
    expect(parseFxRate("0.79\n2025年12月23日 00時00分")).toBe(0.79);
  });

  test("レートがない場合は undefined", () => {
    expect(parseFxRate("")).toBeUndefined();
    expect(parseFxRate("日時のみ")).toBeUndefined();
  });
});

describe("parsePointQuantity", () => {
  test("ポイント数から数値を抽出", () => {
    expect(parsePointQuantity("98,569ポイント")).toBe(98569);
  });

  test("値がない場合は undefined", () => {
    expect(parsePointQuantity("")).toBeUndefined();
  });
});

describe("parsePointRate", () => {
  test("換算レートを数値で返す", () => {
    expect(parsePointRate("0.30")).toBe(0.3);
  });

  test("値がない場合は undefined", () => {
    expect(parsePointRate("")).toBeUndefined();
  });
});
