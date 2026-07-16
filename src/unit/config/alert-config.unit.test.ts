import type * as vscode from "vscode";
import { describe, expect, it } from "vitest";
import { AlertConfigSection } from "../../core/config/alert-config";

function createConfig(values: Record<string, number>): vscode.WorkspaceConfiguration {
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      return (key in values ? values[key] : defaultValue) as T | undefined;
    },
    inspect<T>(key: string) {
      return {
        key,
        defaultValue: (key === "budget.cycleTarget" ? 0 : undefined) as T | undefined,
        globalValue: (key in values ? values[key] : undefined) as T | undefined,
      };
    },
  } as vscode.WorkspaceConfiguration;
}

describe("AlertConfigSection cycle target migration", () => {
  it("prefers the new cycle target setting", () => {
    const section = new AlertConfigSection(
      createConfig({ "budget.cycleTarget": 1_500, "budget.monthlyTarget": 900 })
    );

    expect(section.getMonthlyTarget()).toBe(1_500);
  });

  it("uses the legacy monthly target when no cycle target is configured", () => {
    const section = new AlertConfigSection(createConfig({ "budget.monthlyTarget": 900 }));

    expect(section.getMonthlyTarget()).toBe(900);
  });

  it("lets an explicit zero cycle target disable a legacy target", () => {
    const section = new AlertConfigSection(
      createConfig({ "budget.cycleTarget": 0, "budget.monthlyTarget": 900 })
    );

    expect(section.getMonthlyTarget()).toBe(0);
  });
});
