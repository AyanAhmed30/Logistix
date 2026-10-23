import jsPDF from "jspdf";
import {
  buildEstimatedDutiesDisplay,
  computeCombinedFinalAnswer,
  computeInquiryPricing,
  computeInquiryTaxBreakdown,
  computeVolumetricWeight,
  formatCalculatorSectionTitle,
  withDerivedInvValue,
  type CalculatorPricingConfig,
  type InquiryPricingResult,
} from "@/lib/inquiry-calculator";

/* ============================================================
   A4
   ============================================================ */

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;

const MARGIN_X = 6;
const MARGIN_TOP = 5;
const MARGIN_BOTTOM = 5;

const CONTENT_WIDTH =
  PAGE_WIDTH - MARGIN_X * 2;

const AVAILABLE_HEIGHT =
  PAGE_HEIGHT -
  MARGIN_TOP -
  MARGIN_BOTTOM;

/*
 * Important:
 *
 * Start LARGE.
 * We only shrink when the complete layout cannot
 * physically fit on one A4 page.
 */
const START_SCALE = 1.08;

/*
 * Do not make normal single-calculator PDFs tiny.
 */
const MIN_SCALE = 0.84;
const MIN_FONT_SIZE = 8.5;

/* ============================================================
   TYPES
   ============================================================ */

export type LeadManagementPdfInput = {
  leadNumber?: string | null;
  productName?: string | null;
  totalWeightKg: number;
  cbm: number;
  quantityFallback?: string;
  pricingConfig: CalculatorPricingConfig;
  calculators: Record<string, string>[];
};

type DrawContext = {
  doc: jsPDF;
  y: number;
  fontScale: number;
};

/* ============================================================
   BASIC HELPERS
   ============================================================ */

function fs(
  ctx: DrawContext,
  size: number
) {
  return Math.max(
    MIN_FONT_SIZE,
    size * ctx.fontScale
  );
}

function num(
  value: string | number | null | undefined
) {
  const n = parseFloat(
    String(value ?? "")
      .replace(/,/g, "")
  );

  return Number.isFinite(n)
    ? n
    : 0;
}

function decimal4(n: number) {
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      })
    : "0.0000";
}

function amount(n: number) {
  return Number.isFinite(n)
    ? Math.round(n).toLocaleString()
    : "0";
}

function money(n: number) {
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";
}

function rate(n: number) {
  return Number.isFinite(n)
    ? n.toFixed(6)
    : "-";
}

/* ============================================================
   PRICING
   ============================================================ */

function buildPricingResult(
  values: Record<string, string>,
  totalWeightKg: number,
  cbm: number,
  pricingConfig: CalculatorPricingConfig
): InquiryPricingResult | null {
  const taxBreakdown =
    computeInquiryTaxBreakdown(values);

  if (!taxBreakdown) {
    return null;
  }

  return computeInquiryPricing(
    taxBreakdown,
    {
      totalWeightKg,
      cbm,
      pricingConfig,
    }
  );
}

/* ============================================================
   TEXT
   ============================================================ */

function wrappedText(
  ctx: DrawContext,
  text: string,
  options?: {
    size?: number;
    bold?: boolean;
    color?: [number, number, number];
    x?: number;
    width?: number;
  }
) {
  const size = fs(
    ctx,
    options?.size ?? 9
  );

  const x =
    options?.x ?? MARGIN_X;

  const width =
    options?.width ??
    CONTENT_WIDTH;

  ctx.doc.setFont(
    "helvetica",
    options?.bold
      ? "bold"
      : "normal"
  );

  ctx.doc.setFontSize(size);

  ctx.doc.setTextColor(
    ...(options?.color ?? [
      30,
      41,
      59,
    ])
  );

  const lines =
    ctx.doc.splitTextToSize(
      text,
      width
    ) as string[];

  const lineHeight =
    size * 0.38;

  for (const line of lines) {
    ctx.doc.text(
      line,
      x,
      ctx.y +
        lineHeight * 0.85
    );

    ctx.y += lineHeight;
  }
}

/* ============================================================
   TABLE
   ============================================================ */

/*
 * This is intentionally compact vertically.
 *
 * We reduce cell padding rather than reducing
 * font size.
 */
function tableRow(
  ctx: DrawContext,
  cells: {
    text: string;
    width: number;
    align?: "left" | "center" | "right";
    bold?: boolean;
  }[],
  options?: {
    header?: boolean;
    fill?: [number, number, number];
    x?: number;
  }
) {
  const x0 =
    options?.x ?? MARGIN_X;

  const fontSize = fs(
    ctx,
    options?.header
      ? 9.2
      : 9.1
  );

  /*
   * Very small vertical padding.
   * This is what keeps the table compact.
   */
  const verticalPadding =
    fs(
      ctx,
      options?.header
        ? 0.42
        : 0.32
    );

  const horizontalPadding = 1;

  const lineHeight =
    fontSize * 0.34;

  const lines =
    cells.map((cell) => {
      ctx.doc.setFont(
        "helvetica",
        cell.bold ||
          options?.header
          ? "bold"
          : "normal"
      );

      ctx.doc.setFontSize(
        fontSize
      );

      return ctx.doc.splitTextToSize(
        cell.text || "—",
        Math.max(
          5,
          cell.width -
            horizontalPadding * 2
        )
      ) as string[];
    });

  const maxLines =
    Math.max(
      1,
      ...lines.map(
        (x) => x.length
      )
    );

  const height =
    maxLines * lineHeight +
    verticalPadding * 2;

  const totalWidth =
    cells.reduce(
      (sum, cell) =>
        sum + cell.width,
      0
    );

  /*
   * Background
   */
  if (options?.fill) {
    ctx.doc.setFillColor(
      ...options.fill
    );

    ctx.doc.rect(
      x0,
      ctx.y,
      totalWidth,
      height,
      "F"
    );
  }

  /*
   * Border
   */
  ctx.doc.setDrawColor(
    190,
    205,
    215
  );

  ctx.doc.setLineWidth(
    0.14
  );

  ctx.doc.rect(
    x0,
    ctx.y,
    totalWidth,
    height,
    "S"
  );

  /*
   * Cells
   */
  let x = x0;

  cells.forEach(
    (cell, index) => {
      if (index > 0) {
        ctx.doc.line(
          x,
          ctx.y,
          x,
          ctx.y + height
        );
      }

      ctx.doc.setFont(
        "helvetica",
        cell.bold ||
          options?.header
          ? "bold"
          : "normal"
      );

      ctx.doc.setFontSize(
        fontSize
      );

      ctx.doc.setTextColor(
        20,
        35,
        50
      );

      const align =
        cell.align ?? "left";

      lines[index].forEach(
        (line, lineIndex) => {
          const y =
            ctx.y +
            verticalPadding +
            lineHeight *
              (lineIndex + 0.83);

          if (
            align === "center"
          ) {
            ctx.doc.text(
              line,
              x +
                cell.width / 2,
              y,
              {
                align: "center",
              }
            );
          } else if (
            align === "right"
          ) {
            ctx.doc.text(
              line,
              x +
                cell.width -
                horizontalPadding,
              y,
              {
                align: "right",
              }
            );
          } else {
            ctx.doc.text(
              line,
              x +
                horizontalPadding,
              y
            );
          }
        }
      );

      x += cell.width;
    }
  );

  ctx.y += height;
}

/* ============================================================
   DUTIES SECTION
   ============================================================ */

function drawDutiesSection(
  ctx: DrawContext,
  values: Record<string, string>,
  quantityFallback: string | undefined,
  title: string,
  showDisclaimer: boolean
) {
  const derived =
    withDerivedInvValue({
      ...values,
      quantity:
        values.quantity ||
        quantityFallback ||
        "0",
    });

  const display =
    buildEstimatedDutiesDisplay(
      derived,
      {
        hsCode:
          derived.hs_code,
        quantity:
          derived.quantity ||
          quantityFallback,
      }
    );

  /*
   * ==========================================================
   * HEADER
   * ==========================================================
   */

  const headerHeight =
    fs(ctx, 7.5);

  ctx.doc.setFillColor(
    195,
    195,
    195
  );

  ctx.doc.setDrawColor(
    165,
    165,
    165
  );

  ctx.doc.rect(
    MARGIN_X,
    ctx.y,
    CONTENT_WIDTH,
    headerHeight,
    "FD"
  );

  ctx.doc.setFont(
    "helvetica",
    "bold"
  );

  ctx.doc.setFontSize(
    fs(ctx, 11.4)
  );

  ctx.doc.setTextColor(
    15,
    25,
    35
  );

  ctx.doc.text(
    title,
    MARGIN_X + 2,
    ctx.y +
      headerHeight * 0.72
  );

  ctx.y += headerHeight;

  /*
   * ==========================================================
   * DISCLAIMER
   * ==========================================================
   */

  if (
    showDisclaimer &&
    display
  ) {
    ctx.y += fs(
      ctx,
      0.25
    );

    wrappedText(
      ctx,
      `Disclaimer : Calculated duties and taxes are indicative only by assuming Landing Charges & Insurance 1% and current Exchange Rate: ${
        display.exchangeRateDisplay > 0
          ? display.exchangeRateDisplay.toFixed(6)
          : "0.000000"
      }`,
      {
        size: 7.5,
        color: [
          100,
          110,
          120,
        ],
      }
    );

    ctx.y += fs(
      ctx,
      0.25
    );
  }

  /*
   * ==========================================================
   * NO DISPLAY
   * ==========================================================
   */

  if (!display) {
    wrappedText(
      ctx,
      "No duty values entered in the calculator yet.",
      {
        size: 9,
        color: [
          110,
          120,
          130,
        ],
      }
    );

    ctx.y += fs(
      ctx,
      0.5
    );

    return;
  }

  /*
   * ==========================================================
   * FIRST TABLE
   * ==========================================================
   */

  const quarter =
    CONTENT_WIDTH / 4;

  tableRow(
    ctx,
    [
      {
        text: "HS Code",
        width: quarter,
        align: "center",
        bold: true,
      },
      {
        text: "Unit Value",
        width: quarter,
        align: "center",
        bold: true,
      },
      {
        text: "Total INV Value",
        width: quarter,
        align: "center",
        bold: true,
      },
      {
        text: "Import Value",
        width: quarter,
        align: "center",
        bold: true,
      },
    ],
    {
      header: true,
      fill: [
        232,
        232,
        232,
      ],
    }
  );

  tableRow(
    ctx,
    [
      {
        text:
          `− ${display.hsCodeDisplay}`,
        width: quarter,
        align: "left",
        bold: true,
      },
      {
        text: decimal4(
          num(
            derived.unit_value
          )
        ),
        width: quarter,
        align: "center",
      },
      {
        text: decimal4(
          num(
            derived.inv_value
          )
        ),
        width: quarter,
        align: "center",
      },
      {
        text: decimal4(
          display.importValue
        ),
        width: quarter,
        align: "center",
      },
    ]
  );

  /*
   * ==========================================================
   * DUTY TABLE
   * ==========================================================
   */

  const dutyWidth =
    CONTENT_WIDTH * 0.40;

  const rateWidth =
    CONTENT_WIDTH * 0.30;

  const payableWidth =
    CONTENT_WIDTH * 0.30;

  tableRow(
    ctx,
    [
      {
        text: "Duty Name",
        width: dutyWidth,
        align: "left",
        bold: true,
      },
      {
        text: "Applicable Rate",
        width: rateWidth,
        align: "center",
        bold: true,
      },
      {
        text: "Net Payable Amount",
        width: payableWidth,
        align: "center",
        bold: true,
      },
    ],
    {
      header: true,
      fill: [
        232,
        232,
        232,
      ],
    }
  );

  for (const row of display.rows) {
    tableRow(
      ctx,
      [
        {
          text: row.name,
          width: dutyWidth,
          align: "left",
        },
        {
          text:
            row.rate === null
              ? "—"
              : `${row.rate.toFixed(
                  0
                )}%`,
          width: rateWidth,
          align: "center",
        },
        {
          text: amount(
            row.amount
          ),
          width: payableWidth,
          align: "center",
        },
      ],
      row.name === "Sales Tax"
        ? {
            fill: [
              210,
              235,
              248,
            ],
          }
        : undefined
    );
  }

  /*
   * ==========================================================
   * GRAND TOTAL
   * ==========================================================
   */

  tableRow(
    ctx,
    [
      {
        text: "Grand Total",
        width:
          dutyWidth +
          rateWidth,
        align: "center",
        bold: true,
      },
      {
        text: amount(
          display.grandTotal
        ),
        width: payableWidth,
        align: "center",
        bold: true,
      },
    ],
    {
      fill: [
        248,
        248,
        248,
      ],
    }
  );

  ctx.y += fs(
    ctx,
    1.5
  );
}

/* ============================================================
   FINAL METRICS
   ============================================================ */

function drawMetrics(
  ctx: DrawContext,
  items: {
    label: string;
    value: string;
  }[],
  x: number,
  width: number
) {
  const columnWidth =
    width / items.length;

  /*
   * Labels remain compact.
   */
  const labelSize =
    fs(ctx, 7.8);

  /*
   * Numbers are intentionally BIG.
   */
  const valueSize =
    fs(ctx, 13);

  const startY =
    ctx.y;

  let maxLabelLines = 1;

  items.forEach(
    (item, index) => {
      const columnX =
        x +
        index *
          columnWidth;

      ctx.doc.setFont(
        "helvetica",
        "normal"
      );

      ctx.doc.setFontSize(
        labelSize
      );

      ctx.doc.setTextColor(
        100,
        116,
        139
      );

      const lines =
        ctx.doc.splitTextToSize(
          item.label,
          columnWidth - 3
        ) as string[];

      maxLabelLines =
        Math.max(
          maxLabelLines,
          lines.length
        );

      lines.forEach(
        (line, lineIndex) => {
          ctx.doc.text(
            line,
            columnX,
            startY +
              labelSize * 0.32 +
              lineIndex *
                labelSize *
                0.36
          );
        }
      );
    }
  );

  const valueY =
    startY +
    maxLabelLines *
      labelSize *
      0.36 +
    fs(ctx, 0.8);

  items.forEach(
    (item, index) => {
      const columnX =
        x +
        index *
          columnWidth;

      ctx.doc.setFont(
        "helvetica",
        "bold"
      );

      ctx.doc.setFontSize(
        valueSize
      );

      ctx.doc.setTextColor(
        15,
        30,
        45
      );

      ctx.doc.text(
        item.value,
        columnX,
        valueY +
          valueSize * 0.32
      );
    }
  );

  ctx.y =
    valueY +
    valueSize * 0.38 +
    fs(ctx, 1);
}

/* ============================================================
   PRICING CARD
   ============================================================ */

function pricingCard(
  ctx: DrawContext,
  data: {
    title: string;
    body: string;
    muted?: string;
    result: string;
  },
  x: number,
  width: number
) {
  const padding =
    fs(ctx, 1.7);

  const titleSize =
    fs(ctx, 8);

  const bodySize =
    fs(ctx, 8.6);

  /*
   * Large final answer.
   */
  const resultSize =
    fs(ctx, 13.5);

  const textWidth =
    width -
    padding * 2;

  /*
   * Measure
   */
  ctx.doc.setFont(
    "helvetica",
    "bold"
  );

  ctx.doc.setFontSize(
    titleSize
  );

  const titleLines =
    ctx.doc.splitTextToSize(
      data.title,
      textWidth
    ) as string[];

  ctx.doc.setFont(
    "helvetica",
    "normal"
  );

  ctx.doc.setFontSize(
    bodySize
  );

  const bodyLines =
    ctx.doc.splitTextToSize(
      data.body,
      textWidth
    ) as string[];

  const mutedLines =
    data.muted
      ? (ctx.doc.splitTextToSize(
          data.muted,
          textWidth
        ) as string[])
      : [];

  ctx.doc.setFont(
    "helvetica",
    "bold"
  );

  ctx.doc.setFontSize(
    resultSize
  );

  const resultLines =
    ctx.doc.splitTextToSize(
      data.result,
      textWidth
    ) as string[];

  const titleH =
    titleLines.length *
    titleSize *
    0.35;

  const bodyH =
    bodyLines.length *
    bodySize *
    0.35;

  const mutedH =
    mutedLines.length
      ? mutedLines.length *
          bodySize *
          0.35
      : 0;

  const resultH =
    resultLines.length *
    resultSize *
    0.39;

  const cardHeight =
    padding * 2 +
    titleH +
    fs(ctx, 0.35) +
    bodyH +
    fs(ctx, 0.3) +
    mutedH +
    (mutedLines.length
      ? fs(ctx, 0.3)
      : 0) +
    resultH;

  /*
   * Draw card
   */
  ctx.doc.setFillColor(
    255,
    255,
    255
  );

  ctx.doc.setDrawColor(
    238,
    242,
    245
  );

  ctx.doc.setLineWidth(
    0.2
  );

  ctx.doc.roundedRect(
    x,
    ctx.y,
    width,
    cardHeight,
    1.4,
    1.4,
    "FD"
  );

  let y =
    ctx.y + padding;

  /*
   * Title
   */
  ctx.doc.setFont(
    "helvetica",
    "bold"
  );

  ctx.doc.setFontSize(
    titleSize
  );

  ctx.doc.setTextColor(
    71,
    85,
    105
  );

  titleLines.forEach(
    (line) => {
      ctx.doc.text(
        line,
        x + padding,
        y +
          titleSize * 0.3
      );

      y +=
        titleSize * 0.35;
    }
  );

  y += fs(
    ctx,
    0.35
  );

  /*
   * Body
   */
  ctx.doc.setFont(
    "helvetica",
    "normal"
  );

  ctx.doc.setFontSize(
    bodySize
  );

  ctx.doc.setTextColor(
    51,
    65,
    85
  );

  bodyLines.forEach(
    (line) => {
      ctx.doc.text(
        line,
        x + padding,
        y +
          bodySize * 0.3
      );

      y +=
        bodySize * 0.35;
    }
  );

  y += fs(
    ctx,
    0.3
  );

  /*
   * Muted
   */
  if (
    mutedLines.length
  ) {
    ctx.doc.setFont(
      "helvetica",
      "normal"
    );

    ctx.doc.setFontSize(
      bodySize
    );

    ctx.doc.setTextColor(
      100,
      116,
      139
    );

    mutedLines.forEach(
      (line) => {
        ctx.doc.text(
          line,
          x + padding,
          y +
            bodySize * 0.3
        );

        y +=
          bodySize * 0.35;
      }
    );

    y += fs(
      ctx,
      0.3
    );
  }

  /*
   * LARGE RESULT
   */
  ctx.doc.setFont(
    "helvetica",
    "bold"
  );

  ctx.doc.setFontSize(
    resultSize
  );

  ctx.doc.setTextColor(
    10,
    20,
    30
  );

  resultLines.forEach(
    (line) => {
      ctx.doc.text(
        line,
        x + padding,
        y +
          resultSize * 0.31
      );

      y +=
        resultSize * 0.39;
    }
  );

  ctx.y +=
    cardHeight +
    fs(ctx, 0.8);
}

/* ============================================================
   FINAL PRICING
   ============================================================ */

function drawFinalPricing(
  ctx: DrawContext,
  calculators: Record<string, string>[],
  totalWeightKg: number,
  cbm: number,
  pricingConfig: CalculatorPricingConfig
) {
  const startY =
    ctx.y;

  const boxX =
    MARGIN_X;

  const boxWidth =
    CONTENT_WIDTH;

  const padding =
    fs(ctx, 2);

  const innerX =
    boxX + padding;

  const innerWidth =
    boxWidth -
    padding * 2;

  const volumetricWeight =
    computeVolumetricWeight(cbm);

  const multi =
    calculators.length > 1;

  const primary =
    withDerivedInvValue({
      ...(calculators[0] || {}),
      quantity:
        calculators[0]?.quantity ||
        "0",
    });

  /*
   * ==========================================================
   * MEASURE FIRST
   * ==========================================================
   */

  const measure =
    new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

  const mctx: DrawContext = {
    doc: measure,
    y: startY + padding,
    fontScale:
      ctx.fontScale,
  };

  paintPricingContent(
    mctx,
    calculators,
    totalWeightKg,
    cbm,
    pricingConfig,
    volumetricWeight,
    multi,
    primary,
    innerX,
    innerWidth
  );

  const boxHeight =
    mctx.y +
    padding -
    startY;

  /*
   * ==========================================================
   * BOX
   * ==========================================================
   */

  ctx.doc.setFillColor(
    240,
    253,
    250
  );

  ctx.doc.setDrawColor(
    45,
    212,
    191
  );

  ctx.doc.setLineWidth(
    0.4
  );

  ctx.doc.roundedRect(
    boxX,
    startY,
    boxWidth,
    boxHeight,
    2.2,
    2.2,
    "FD"
  );

  /*
   * ==========================================================
   * REAL CONTENT
   * ==========================================================
   */

  ctx.y =
    startY + padding;

  paintPricingContent(
    ctx,
    calculators,
    totalWeightKg,
    cbm,
    pricingConfig,
    volumetricWeight,
    multi,
    primary,
    innerX,
    innerWidth
  );

  ctx.y =
    startY +
    boxHeight +
    fs(ctx, 0.4);
}

/* ============================================================
   PAINT PRICING CONTENT
   ============================================================ */

function paintPricingContent(
  ctx: DrawContext,
  calculators: Record<string, string>[],
  totalWeightKg: number,
  cbm: number,
  pricingConfig: CalculatorPricingConfig,
  volumetricWeight: number,
  multi: boolean,
  primary: Record<string, string>,
  x: number,
  width: number
) {
  /*
   * ==========================================================
   * TITLE
   * ==========================================================
   */

  ctx.doc.setFont(
    "helvetica",
    "bold"
  );

  ctx.doc.setFontSize(
    fs(ctx, 12.5)
  );

  ctx.doc.setTextColor(
    15,
    118,
    110
  );

  ctx.doc.text(
    "Final Pricing",
    x,
    ctx.y +
      fs(ctx, 3)
  );

  ctx.y += fs(
    ctx,
    5.3
  );

  /*
   * ==========================================================
   * MULTI
   * ==========================================================
   */

  if (multi) {
    const combined =
      computeCombinedFinalAnswer(
        calculators,
        {
          totalWeightKg,
          cbm,
          pricingConfig,
        }
      );

    drawMetrics(
      ctx,
      [
        {
          label:
            "Volumetric Weight (CBM × 200)",
          value:
            rate(
              volumetricWeight
            ),
        },
        {
          label:
            "Total Weight (kg)",
          value:
            totalWeightKg > 0
              ? String(
                  totalWeightKg
                )
              : "-",
        },
        {
          label:
            "Combined Total",
          value:
            combined === null
              ? "-"
              : rate(
                  combined
                ),
        },
      ],
      x,
      width
    );

    pricingCard(
      ctx,
      {
        title:
          "Combined Final Pricing",
        body:
          "Total = sum of all inquiry calculations",
        result:
          combined === null
            ? "Total = -"
            : `Total = ${rate(
                combined
              )}`,
      },
      x,
      width
    );

    return;
  }

  /*
   * ==========================================================
   * SINGLE
   * ==========================================================
   */

  const pricing =
    buildPricingResult(
      primary,
      totalWeightKg,
      cbm,
      pricingConfig
    );

  if (!pricing) {
    wrappedText(
      ctx,
      "Enter invoice and tax values to calculate pricing.",
      {
        size: 9,
        color: [
          120,
          130,
          140,
        ],
        x,
        width,
      }
    );

    return;
  }

  /*
   * ==========================================================
   * METRICS
   * ==========================================================
   */

  drawMetrics(
    ctx,
    [
      {
        label:
          "Volumetric Weight (CBM × 200)",
        value:
          rate(
            volumetricWeight
          ),
      },
      {
        label:
          "Total Weight (kg)",
        value:
          totalWeightKg > 0
            ? String(
                totalWeightKg
              )
            : "-",
      },
      {
        label:
          "X (Sum of Taxes ÷ Weight)",
        value:
          rate(
            pricing.taxPerKg
          ),
      },
    ],
    x,
    width
  );

  /*
   * ==========================================================
   * CASE 1
   * ==========================================================
   */

  if (
    pricing.pricingCase ===
    "gross_weight"
  ) {
    pricingCard(
      ctx,
      {
        title:
          "Case 1 — VW < Total Weight",
        body:
          "Final Answer = X + Gross Weight Value",
        result:
          `${rate(
            pricing.taxPerKg
          )} + ${money(
            pricing.grossWeightValue
          )} = ${rate(
            pricing.finalAnswer
          )}`,
      },
      x,
      width
    );

    return;
  }

  /*
   * ==========================================================
   * CASE 2 LABEL
   * ==========================================================
   */

  ctx.doc.setFont(
    "helvetica",
    "bold"
  );

  ctx.doc.setFontSize(
    fs(ctx, 8.3)
  );

  ctx.doc.setTextColor(
    100,
    116,
    139
  );

  ctx.doc.text(
    "CASE 2 — VW > TOTAL WEIGHT",
    x,
    ctx.y +
      fs(ctx, 1.5)
  );

  ctx.y += fs(
    ctx,
    3.1
  );

  /*
   * ==========================================================
   * SUBCASE 2.1
   * ==========================================================
   */

  pricingCard(
    ctx,
    {
      title:
        "Subcase 2.1 — Volumetric",
      body:
        "Final Answer = X + Volumetric Weight Value",
      muted:
        `X: ${rate(
          pricing.taxPerKg
        )}`,
      result:
        `${rate(
          pricing.taxPerKg
        )} + ${money(
          pricing.volumetricWeightValue
        )} = ${rate(
          pricing.case2Subcases!
            .volumetric
            .finalAnswer
        )}`,
    },
    x,
    width
  );

  /*
   * ==========================================================
   * SUBCASE 2.2
   * ==========================================================
   */

  pricingCard(
    ctx,
    {
      title:
        "Subcase 2.2 — CBM",
      body:
        "Final Answer = X + CBM Value",
      muted:
        `X: ${rate(
          pricing.taxPerKg
        )}`,
      result:
        `${rate(
          pricing.taxPerKg
        )} + ${money(
          pricing.cbmValue
        )} = ${rate(
          pricing.case2Subcases!
            .cbm
            .finalAnswer
        )}`,
    },
    x,
    width
  );
}

/* ============================================================
   COMPLETE PAGE
   ============================================================ */

function renderPage(
  doc: jsPDF,
  scale: number,
  input: LeadManagementPdfInput,
  calculators: Record<string, string>[]
) {
  const ctx: DrawContext = {
    doc,
    y: MARGIN_TOP,
    fontScale: scale,
  };

  /*
   * ==========================================================
   * HEADER
   * ==========================================================
   */

  const header: string[] = [];

  if (
    input.leadNumber?.trim()
  ) {
    header.push(
      `Lead ${input.leadNumber.trim()}`
    );
  }

  if (
    input.productName?.trim()
  ) {
    header.push(
      input.productName.trim()
    );
  }

  if (header.length) {
    wrappedText(
      ctx,
      header.join("  ·  "),
      {
        size: 12,
        bold: true,
        color: [
          15,
          23,
          42,
        ],
        x: MARGIN_X,
        width: CONTENT_WIDTH,
      }
    );

    ctx.y += fs(
      ctx,
      0.6
    );
  }

  /*
   * ==========================================================
   * DUTIES
   * ==========================================================
   */

  calculators.forEach(
    (calculator, index) => {
      const title =
        calculators.length > 1
          ? `Estimated Duties And Taxes — ${formatCalculatorSectionTitle(
              calculator,
              index,
              calculators.length
            )}`
          : "Estimated Duties And Taxes";

      drawDutiesSection(
        ctx,
        calculator,
        input.quantityFallback,
        title,
        index === 0
      );
    }
  );

  /*
   * ==========================================================
   * FINAL PRICING
   * ==========================================================
   */

  drawFinalPricing(
    ctx,
    calculators,
    input.totalWeightKg,
    input.cbm,
    input.pricingConfig
  );

  return ctx.y;
}

/* ============================================================
   DOWNLOAD
   ============================================================ */

export async function downloadLeadManagementPdf(
  input: LeadManagementPdfInput
) {
  const lead =
    input.leadNumber
      ?.trim()
      .replace(
        /[^\w-]+/g,
        "_"
      ) ||
    "lead";

  const product =
    input.productName
      ?.trim()
      .replace(
        /[^\w-]+/g,
        "_"
      )
      .slice(0, 40) ||
    "inquiry";

  const fileName =
    `lead-management-${lead}-${product}.pdf`;

  const calculators =
    Array.isArray(
      input.calculators
    ) &&
    input.calculators.length
      ? input.calculators
      : [{}];

  /*
   * ==========================================================
   * START LARGE
   * ==========================================================
   */

  let scale =
    START_SCALE;

  let doc =
    new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

  let endY =
    renderPage(
      doc,
      scale,
      input,
      calculators
    );

  /*
   * ==========================================================
   * FIT TO ONE PAGE
   * ==========================================================
   *
   * IMPORTANT:
   *
   * We don't immediately shrink from 1.08 to something tiny.
   * Instead we reduce gradually.
   *
   * Table itself is already compact, so the font can stay
   * much larger.
   * ==========================================================
   */

  for (
    let attempt = 0;
    attempt < 40;
    attempt++
  ) {
    const maxY =
      PAGE_HEIGHT -
      MARGIN_BOTTOM;

    if (
      endY <= maxY
    ) {
      break;
    }

    const used =
      endY -
      MARGIN_TOP;

    const target =
      AVAILABLE_HEIGHT *
      0.985;

    let next =
      scale *
      (target /
        Math.max(
          used,
          1
        ));

    /*
     * Never shrink more than 5% in one iteration.
     */
    next = Math.min(
      next,
      scale * 0.95
    );

    scale =
      Math.max(
        MIN_SCALE,
        next
      );

    doc =
      new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

    endY =
      renderPage(
        doc,
        scale,
        input,
        calculators
      );

    if (
      scale <=
      MIN_SCALE
    ) {
      break;
    }
  }

  /*
   * ==========================================================
   * STRICT ONE PAGE
   * ==========================================================
   */

  while (
    doc.getNumberOfPages() >
    1
  ) {
    doc.deletePage(
      doc.getNumberOfPages()
    );
  }

  /*
   * ==========================================================
   * SAVE
   * ==========================================================
   */

  doc.save(fileName);
}
