import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  InvalidPanelModeError,
  createConnectedPanelQuery,
  createPreviewPanelQuery,
  parsePanelMode,
  resolvePanelQuery,
  type ConnectedPanelPort,
  type PanelMode,
  type PanelQuery,
} from "@/shared/panel-query";

type ContractViewModel = {
  readonly heading: string;
  readonly items: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly sourceMode: PanelMode;
};

const previewViewModel = {
  heading: "Fictional panel contract",
  items: [{ id: "preview-item", label: "Local fictional item" }],
  sourceMode: "preview",
} as const satisfies ContractViewModel;

const connectedViewModel = {
  heading: "Connected panel contract",
  items: [{ id: "connected-item", label: "Injected port item" }],
  sourceMode: "connected",
} as const satisfies ContractViewModel;

describe("panel query public contract", () => {
  it("freezes PanelMode and PanelQuery<T> at compile time", () => {
    expectTypeOf<PanelMode>().toEqualTypeOf<"preview" | "connected">();

    const query: PanelQuery<ContractViewModel> = {
      load: async () => previewViewModel,
    };

    expectTypeOf(query.load).toEqualTypeOf<
      () => Promise<ContractViewModel>
    >();
  });

  it("loads preview data without invoking the connected port", async () => {
    const previewLoader = vi.fn(async () => previewViewModel);
    const connectedPort: ConnectedPanelPort<ContractViewModel> = {
      load: vi.fn(async () => connectedViewModel),
    };
    const previewQuery = createPreviewPanelQuery<ContractViewModel>(
      previewLoader,
    );
    const connectedQuery = createConnectedPanelQuery(connectedPort);

    const result = await resolvePanelQuery("preview", {
      preview: previewQuery,
      connected: connectedQuery,
    }).load();

    expect(result).toEqual(previewViewModel);
    expect(previewLoader).toHaveBeenCalledTimes(1);
    expect(connectedPort.load).not.toHaveBeenCalled();
  });

  it("loads connected data only through the injected port", async () => {
    const previewLoader = vi.fn(async () => previewViewModel);
    const connectedPort: ConnectedPanelPort<ContractViewModel> = {
      load: vi.fn(async () => connectedViewModel),
    };
    const previewQuery = createPreviewPanelQuery<ContractViewModel>(
      previewLoader,
    );
    const connectedQuery = createConnectedPanelQuery(connectedPort);

    const result = await resolvePanelQuery("connected", {
      preview: previewQuery,
      connected: connectedQuery,
    }).load();

    expect(result).toEqual(connectedViewModel);
    expect(connectedPort.load).toHaveBeenCalledTimes(1);
    expect(previewLoader).not.toHaveBeenCalled();
  });

  it("keeps both adapters on the same compile-time and runtime shape", async () => {
    const previewQuery: PanelQuery<ContractViewModel> =
      createPreviewPanelQuery(async () => previewViewModel);
    const connectedQuery: PanelQuery<ContractViewModel> =
      createConnectedPanelQuery({ load: async () => connectedViewModel });

    expectTypeOf(previewQuery).toEqualTypeOf<
      PanelQuery<ContractViewModel>
    >();
    expectTypeOf(connectedQuery).toEqualTypeOf<
      PanelQuery<ContractViewModel>
    >();

    const previewResult = await previewQuery.load();
    const connectedResult = await connectedQuery.load();

    expect(Object.keys(previewResult)).toEqual(Object.keys(connectedResult));
    expect(Object.keys(previewResult.items[0])).toEqual(
      Object.keys(connectedResult.items[0]),
    );
  });

  it("selects both exact modes and rejects an unknown boundary value", () => {
    const previewQuery = createPreviewPanelQuery<ContractViewModel>(async () =>
      previewViewModel,
    );
    const connectedQuery = createConnectedPanelQuery<ContractViewModel>({
      load: async () => connectedViewModel,
    });
    const queries = { preview: previewQuery, connected: connectedQuery };

    expect(resolvePanelQuery("preview", queries)).toBe(previewQuery);
    expect(resolvePanelQuery("connected", queries)).toBe(connectedQuery);
    expect(parsePanelMode("preview")).toBe("preview");
    expect(parsePanelMode("connected")).toBe("connected");
    expect(() => parsePanelMode("demo")).toThrow(InvalidPanelModeError);
  });

  it("fails closed when the connected port rejects and never falls back", async () => {
    const connectedFailure = new Error("connected port unavailable");
    const previewLoader = vi.fn(async () => previewViewModel);
    const connectedPort: ConnectedPanelPort<ContractViewModel> = {
      load: vi.fn(async () => {
        throw connectedFailure;
      }),
    };
    const query = resolvePanelQuery("connected", {
      preview: createPreviewPanelQuery<ContractViewModel>(previewLoader),
      connected: createConnectedPanelQuery(connectedPort),
    });

    await expect(query.load()).rejects.toBe(connectedFailure);
    expect(connectedPort.load).toHaveBeenCalledTimes(1);
    expect(previewLoader).not.toHaveBeenCalled();
  });
});
