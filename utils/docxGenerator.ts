import { StoryBlueprint, AnalyzedCharacter, Episode, IpAnalysisReport } from "../types";

// --- Helpers ---

const getSafeExportFileName = (name: string, suffix: string) => {
    const normalizedName = (name || '未命名项目').trim() || '未命名项目';
    const safeName = normalizedName.replace(/[\\/:*?"<>|]/g, '_');
    return `${safeName}${suffix}`;
};

const loadDocxDeps = async () => {
    const [{ default: FileSaver }, docx] = await Promise.all([
        import('file-saver'),
        import('docx'),
    ]);

    return {
        ...docx,
        saveAs: FileSaver.saveAs,
    };
};

const createDocxHelpers = (deps: {
    Paragraph: any;
    TextRun: any;
    HeadingLevel: any;
}) => {
    const { Paragraph, TextRun, HeadingLevel } = deps;

    const createHeading = (text: string, level: any = HeadingLevel.HEADING_1) => {
        return new Paragraph({
            text: text,
            heading: level,
            spacing: { before: 200, after: 200 },
        });
    };

    const createLabelValue = (label: string, value: string, color: string = "000000") => {
        return new Paragraph({
            children: [
                new TextRun({ text: `${label}: `, bold: true, color: "455A64" }),
                new TextRun({ text: value || "无", color: color }),
            ],
            spacing: { after: 100 },
        });
    };

    const createDivider = () => {
        return new Paragraph({
            children: [new TextRun({ text: "--------------------------------------------------", color: "E0E0E0" })],
            spacing: { before: 100, after: 100 },
        });
    };

    return {
        createHeading,
        createLabelValue,
        createDivider,
    };
};

// --- Export Blueprint (Step 1) ---

export const exportBlueprintToDocx = async (
    blueprint: StoryBlueprint, 
    characters: AnalyzedCharacter[], 
    novelName: string
) => {
    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        Table,
        TableRow,
        TableCell,
        WidthType,
        BorderStyle,
        AlignmentType,
        TableLayoutType,
        saveAs,
    } = await loadDocxDeps();
    const { createDivider } = createDocxHelpers({ Paragraph, TextRun, HeadingLevel });
    const children: any[] = [];

    const palette = {
        text: "1F2937",
        muted: "64748B",
        border: "E5E7EB",
        slate: "475569",
        slateSoft: "F8FAFC",
        blue: "2563EB",
        blueSoft: "EFF6FF",
        red: "DC2626",
        redSoft: "FEF2F2",
        emerald: "059669",
        emeraldSoft: "ECFDF5",
        purple: "7C3AED",
        purpleSoft: "F5F3FF",
        amber: "D97706",
        amberSoft: "FFFBEB",
        pink: "BE185D",
        pinkSoft: "FDF2F8",
    };

    const CONTENT_WIDTH = 10440;
    const PAIR_COLUMN_WIDTHS = [1800, 3420, 1800, 3420];
    const GROWTH_COLUMN_WIDTHS = [1800, 2880, 2880, 2880];
    const CONFLICT_COLUMN_WIDTHS = [1600, 2100, 3370, 3370];
    const RELATIONSHIP_COLUMN_WIDTHS = [1800, 2200, 6440];
    const MYSTERY_COLUMN_WIDTHS = [2600, 3920, 3920];
    const PLOT_POINT_COLUMN_WIDTHS = [1400, 1000, 4200, 3840];

    const safeText = (value?: string | number | null) => {
        if (value === undefined || value === null) return "无";
        const normalized = String(value).trim();
        return normalized ? normalized : "无";
    };

    const hasText = (value?: string | null) => Boolean(value && value.trim());

    const formatList = (values?: string[], separator: string = "、") => {
        const items = (values || []).map(item => item?.trim()).filter(Boolean) as string[];
        return items.length > 0 ? items.join(separator) : "无";
    };

    const normalizeMultiline = (text?: string | null) => {
        const lines = (text || "")
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        return lines.length > 0 ? lines : ["无"];
    };

    const createBorder = (color: string = palette.border, size: number = 1) => ({
        style: BorderStyle.SINGLE,
        size,
        color,
    });

    const defaultCellBorders = {
        top: createBorder(),
        bottom: createBorder(),
        left: createBorder(),
        right: createBorder(),
    };

    const createParagraph = (
        text: string,
        options: {
            color?: string;
            bold?: boolean;
            italics?: boolean;
            size?: number;
            alignment?: any;
            spacingAfter?: number;
            spacingBefore?: number;
        } = {}
    ) => new Paragraph({
        alignment: options.alignment,
        spacing: {
            before: options.spacingBefore,
            after: options.spacingAfter ?? 60,
        },
        children: [new TextRun({
            text,
            color: options.color ?? palette.text,
            bold: options.bold,
            italics: options.italics,
            size: options.size,
        })],
    });

    const createEmptyState = (text: string = "暂无数据") => createParagraph(text, {
        color: "94A3B8",
        italics: true,
        spacingAfter: 120,
    });

    const createHeaderCell = (
        text: string,
        fill: string = palette.blueSoft,
        width: number = 25,
        color: string = palette.text,
        widthType: any = WidthType.PERCENTAGE
    ) => new TableCell({
        width: { size: width, type: widthType },
        shading: { fill },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders: defaultCellBorders,
        children: [createParagraph(text, {
            bold: true,
            color,
            size: 21,
            alignment: AlignmentType.CENTER,
            spacingAfter: 0,
        })],
    });

    const createBodyCell = (
        content: string | any[],
        options: {
            width?: number;
            widthType?: any;
            fill?: string;
            align?: any;
        } = {}
    ) => new TableCell({
        width: options.width ? { size: options.width, type: options.widthType || WidthType.PERCENTAGE } : undefined,
        shading: options.fill ? { fill: options.fill } : undefined,
        margins: { top: 110, bottom: 110, left: 120, right: 120 },
        borders: defaultCellBorders,
        children: Array.isArray(content)
            ? content
            : [createParagraph(safeText(content), {
                alignment: options.align,
                size: 21,
                spacingAfter: 0,
            })],
    });

    const createTableBlock = (
        rows: any[],
        options: {
            width?: number;
            widthType?: any;
            columnWidths?: number[];
        } = {}
    ) => new Table({
        width: { size: options.width || CONTENT_WIDTH, type: options.widthType || WidthType.DXA },
        layout: TableLayoutType.FIXED,
        alignment: AlignmentType.LEFT,
        indent: { size: 0, type: WidthType.DXA },
        columnWidths: options.columnWidths,
        rows,
    });

    const createPairRow = (
        leftLabel: string,
        leftValue: string | any[],
        rightLabel: string,
        rightValue: string | any[],
        fill: string = palette.slateSoft,
        widths: number[] = PAIR_COLUMN_WIDTHS
    ) => new TableRow({
        children: [
            createHeaderCell(leftLabel, fill, widths[0], palette.slate, WidthType.DXA),
            createBodyCell(leftValue, { width: widths[1], widthType: WidthType.DXA }),
            createHeaderCell(rightLabel, fill, widths[2], palette.slate, WidthType.DXA),
            createBodyCell(rightValue, { width: widths[3], widthType: WidthType.DXA }),
        ]
    });

    const createSectionTitle = (
        title: string,
        color: string,
        subtitle?: string,
        pageBreakBefore: boolean = false
    ) => {
        const nodes = [
            new Paragraph({
                pageBreakBefore,
                spacing: { before: pageBreakBefore ? 0 : 320, after: subtitle ? 40 : 180 },
                children: [new TextRun({ text: title, bold: true, color, size: 30 })],
            })
        ];

        if (subtitle) {
            nodes.push(createParagraph(subtitle, {
                color: palette.muted,
                italics: true,
                size: 19,
                spacingAfter: 180,
            }));
        }

        return nodes;
    };

    const createSubsectionTitle = (title: string, color: string, subtitle?: string) => {
        const nodes = [
            new Paragraph({
                spacing: { before: 220, after: subtitle ? 30 : 120 },
                children: [new TextRun({ text: title, bold: true, color, size: 24 })],
            })
        ];

        if (subtitle) {
            nodes.push(createParagraph(subtitle, {
                color: palette.muted,
                size: 18,
                italics: true,
                spacingAfter: 120,
            }));
        }

        return nodes;
    };

    const createInfoCard = (
        label: string,
        text: string,
        accentColor: string,
        fill: string = "FFFFFF"
    ) => createTableBlock([
        new TableRow({
            children: [
                new TableCell({
                    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                    shading: { fill },
                    margins: { top: 150, bottom: 150, left: 180, right: 180 },
                    borders: {
                        top: createBorder(),
                        bottom: createBorder(),
                        right: createBorder(),
                        left: createBorder(accentColor, 6),
                    },
                    children: [
                        createParagraph(label, {
                            color: accentColor,
                            bold: true,
                            size: 21,
                            spacingAfter: 70,
                        }),
                        ...normalizeMultiline(text).map((line, index, arr) => createParagraph(line, {
                            color: line === "无" ? palette.muted : palette.text,
                            italics: line === "无",
                            size: 21,
                            spacingAfter: index === arr.length - 1 ? 0 : 55,
                        })),
                    ]
                })
            ]
        })
    ], { columnWidths: [CONTENT_WIDTH] });

    const createListParagraphs = (items: string[], color: string = palette.text) => {
        const normalized = items.map(item => item.trim()).filter(Boolean);
        if (normalized.length === 0) {
            return [createParagraph("无", { color: palette.muted, italics: true, spacingAfter: 0 })];
        }

        return normalized.map(item => new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            children: [new TextRun({ text: item, color, size: 21 })],
        }));
    };

    const createSummaryTable = (items: Array<[string, string]>) => {
        const rows: any[] = [];
        for (let index = 0; index < items.length; index += 2) {
            const [leftLabel, leftValue] = items[index];
            const [rightLabel, rightValue] = items[index + 1] || ["", ""];
            rows.push(new TableRow({
                children: [
                    createHeaderCell(leftLabel, palette.blueSoft, PAIR_COLUMN_WIDTHS[0], palette.blue, WidthType.DXA),
                    createBodyCell(leftValue, { width: PAIR_COLUMN_WIDTHS[1], widthType: WidthType.DXA }),
                    createHeaderCell(rightLabel || " ", palette.blueSoft, PAIR_COLUMN_WIDTHS[2], palette.blue, WidthType.DXA),
                    createBodyCell(rightValue || " ", { width: PAIR_COLUMN_WIDTHS[3], widthType: WidthType.DXA }),
                ]
            }));
        }
        return createTableBlock(rows, { columnWidths: PAIR_COLUMN_WIDTHS });
    };

    const createKeyValueTable = (items: Array<[string, string]>, fill: string, labelColor: string) => {
        const rows: any[] = [];
        for (let index = 0; index < items.length; index += 2) {
            const [leftLabel, leftValue] = items[index];
            const [rightLabel, rightValue] = items[index + 1] || ["", ""];
            rows.push(new TableRow({
                children: [
                    createHeaderCell(leftLabel, fill, PAIR_COLUMN_WIDTHS[0], labelColor, WidthType.DXA),
                    createBodyCell(leftValue, { width: PAIR_COLUMN_WIDTHS[1], widthType: WidthType.DXA }),
                    createHeaderCell(rightLabel || " ", fill, PAIR_COLUMN_WIDTHS[2], labelColor, WidthType.DXA),
                    createBodyCell(rightValue || " ", { width: PAIR_COLUMN_WIDTHS[3], widthType: WidthType.DXA }),
                ]
            }));
        }
        return createTableBlock(rows, { columnWidths: PAIR_COLUMN_WIDTHS });
    };

    const exportDate = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    children.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 80 },
            children: [new TextRun({
                text: `《${novelName || "未命名项目"}》`,
                bold: true,
                color: palette.text,
                size: 38,
            })],
        })
    );
    children.push(
        createParagraph("IP 核心解构方案", {
            alignment: AlignmentType.CENTER,
            color: palette.blue,
            bold: true,
            size: 26,
            spacingAfter: 40,
        })
    );
    children.push(
        createParagraph("适合直接复盘世界观、人物与主线结构的导出版本", {
            alignment: AlignmentType.CENTER,
            color: palette.muted,
            italics: true,
            size: 18,
            spacingAfter: 180,
        })
    );

    children.push(createSummaryTable([
        ["项目名称", safeText(novelName || "未命名项目")],
        ["导出时间", exportDate],
        ["主角识别", blueprint.protagonist ? `${safeText(blueprint.protagonist.name)} / ${safeText(blueprint.protagonist.identity)}` : "未识别"],
        ["已分析章节", `${blueprint.analyzedChapters || 0}`],
        ["主线阶段数", `${blueprint.mainPlotArc?.phases?.length || 0}`],
        ["动态人物数", `${characters?.length || 0}`],
    ]));

    children.push(...createSectionTitle(
        "一、故事三维架构",
        palette.blue,
        "把成长、冲突、关系和暗线拆成一套更易复盘的结构视图。"
    ));

    if (hasText(blueprint.summarySoFar)) {
        children.push(...createSubsectionTitle("1. 累计剧情摘要 / AI 上下文", palette.slate));
        children.push(createInfoCard("累计剧情摘要", blueprint.summarySoFar, palette.slate, palette.slateSoft));
    }

    children.push(...createSubsectionTitle("2. 成长主轴 (Growth Arc)", palette.blue));
    children.push(createInfoCard("成长主轴概述", blueprint.growthArc.summary, palette.blue, palette.blueSoft));
    if (blueprint.growthArc.nodes.length > 0) {
        const growthRows = [
            new TableRow({
                children: [
                    createHeaderCell("阶段", palette.blueSoft, GROWTH_COLUMN_WIDTHS[0], palette.blue, WidthType.DXA),
                    createHeaderCell("关键事件", palette.blueSoft, GROWTH_COLUMN_WIDTHS[1], palette.blue, WidthType.DXA),
                    createHeaderCell("行动", palette.blueSoft, GROWTH_COLUMN_WIDTHS[2], palette.blue, WidthType.DXA),
                    createHeaderCell("结果", palette.blueSoft, GROWTH_COLUMN_WIDTHS[3], palette.blue, WidthType.DXA),
                ]
            })
        ];
        blueprint.growthArc.nodes.forEach(node => {
            growthRows.push(new TableRow({
                children: [
                    createBodyCell(node.stage, { width: GROWTH_COLUMN_WIDTHS[0], widthType: WidthType.DXA, align: AlignmentType.CENTER, fill: "FBFDFF" }),
                    createBodyCell(node.event, { width: GROWTH_COLUMN_WIDTHS[1], widthType: WidthType.DXA }),
                    createBodyCell(node.action, { width: GROWTH_COLUMN_WIDTHS[2], widthType: WidthType.DXA }),
                    createBodyCell(node.result, { width: GROWTH_COLUMN_WIDTHS[3], widthType: WidthType.DXA }),
                ]
            }));
        });
        children.push(createTableBlock(growthRows, { columnWidths: GROWTH_COLUMN_WIDTHS }));
    } else {
        children.push(createEmptyState("暂无成长主轴节点"));
    }

    children.push(...createSubsectionTitle("3. 冲突博弈 (Conflict Arc)", palette.red));
    if (blueprint.conflictArc.nodes.length > 0) {
        const conflictRows = [
            new TableRow({
                children: ["阶段", "对手", "冲突", "结果"].map(header => createHeaderCell(header, palette.redSoft, 25, palette.red))
            })
        ];
        blueprint.conflictArc.nodes.forEach(node => {
            conflictRows.push(new TableRow({
                children: [
                    createBodyCell(node.stage, { width: 25, align: AlignmentType.CENTER, fill: "FFFDFD" }),
                    createBodyCell(node.antagonist, { width: 25 }),
                    createBodyCell(node.conflict, { width: 25 }),
                    createBodyCell(node.result, { width: 25 }),
                ]
            }));
        });
        children.push(createTableBlock(conflictRows));
    } else {
        children.push(createEmptyState("暂无冲突博弈节点"));
    }

    children.push(...createSubsectionTitle("4. 关系演化 (Relationship Arc)", palette.emerald));
    if (blueprint.relationshipArc.nodes.length > 0) {
        const relationshipRows = [
            new TableRow({
                children: [
                    createHeaderCell("人物", palette.emeraldSoft, 20, palette.emerald),
                    createHeaderCell("身份", palette.emeraldSoft, 20, palette.emerald),
                    createHeaderCell("关系变化 / 高光互动", palette.emeraldSoft, 60, palette.emerald),
                ]
            })
        ];
        blueprint.relationshipArc.nodes.forEach(node => {
            relationshipRows.push(new TableRow({
                children: [
                    createBodyCell(node.character, { width: 20, align: AlignmentType.CENTER }),
                    createBodyCell(node.identity, { width: 20, align: AlignmentType.CENTER }),
                    createBodyCell(node.change, { width: 60 }),
                ]
            }));
        });
        children.push(createTableBlock(relationshipRows));
    } else {
        children.push(createEmptyState("暂无关系演化节点"));
    }

    children.push(...createSubsectionTitle("5. 宿命与暗线 (Mystery Arc)", palette.purple));
    if (hasText(blueprint.mysteryArc.summary)) {
        children.push(createInfoCard("宿命与暗线概述", blueprint.mysteryArc.summary, palette.purple, palette.purpleSoft));
    }
    if (blueprint.mysteryArc.nodes.length > 0) {
        const mysteryRows = [
            new TableRow({
                children: [
                    createHeaderCell("源起", palette.purpleSoft, 30, palette.purple),
                    createHeaderCell("进展", palette.purpleSoft, 35, palette.purple),
                    createHeaderCell("悬念", palette.purpleSoft, 35, palette.purple),
                ]
            })
        ];
        blueprint.mysteryArc.nodes.forEach(node => {
            mysteryRows.push(new TableRow({
                children: [
                    createBodyCell(node.origin, { width: 30 }),
                    createBodyCell(node.progress, { width: 35 }),
                    createBodyCell(node.suspense, { width: 35, fill: "FCFBFF" }),
                ]
            }));
        });
        children.push(createTableBlock(mysteryRows));
    } else if (!hasText(blueprint.mysteryArc.summary)) {
        children.push(createEmptyState("暂无宿命与暗线节点"));
    }

    children.push(...createSectionTitle(
        "二、主线大纲 & 事件流",
        palette.emerald,
        "按阶段与事件展开，阅读时更像结构化策划案。",
        true
    ));

    if (!blueprint.mainPlotArc.phases.length) {
        children.push(createEmptyState("暂无主线大纲数据"));
    }

    blueprint.mainPlotArc.phases.forEach((phase, phaseIndex) => {
        children.push(
            createParagraph(
                `${phase.phaseName || `阶段 ${phaseIndex + 1}`}  ·  ${phase.events.length} 个事件`,
                {
                    color: palette.emerald,
                    bold: true,
                    size: 24,
                    spacingBefore: 180,
                    spacingAfter: 100,
                }
            )
        );

        if (!phase.events.length) {
            children.push(createEmptyState("该阶段暂无事件"));
            return;
        }

        phase.events.forEach(evt => {
            const importanceStars = typeof evt.importance === 'number'
                ? `重要度 ${'★'.repeat(Math.max(1, Math.min(5, evt.importance)))}`
                : "";

            children.push(new Paragraph({
                spacing: { before: 150, after: 60 },
                children: [
                    new TextRun({ text: safeText(evt.range), bold: true, color: palette.emerald, size: 20 }),
                    new TextRun({ text: "  ｜  ", color: palette.muted, size: 20 }),
                    new TextRun({ text: safeText(evt.title), bold: true, color: palette.text, size: 24 }),
                    ...(importanceStars
                        ? [new TextRun({ text: `   ${importanceStars}`, bold: true, color: palette.amber, size: 20 })]
                        : []),
                ]
            }));

            children.push(createInfoCard("事件摘要", evt.summary || evt.content, palette.emerald, palette.emeraldSoft));

            if (evt.plotPoints && evt.plotPoints.length > 0) {
                children.push(createParagraph("关键情节点", {
                    color: palette.amber,
                    bold: true,
                    size: 22,
                    spacingBefore: 120,
                    spacingAfter: 70,
                }));

                const plotPointRows = [
                    new TableRow({
                        children: [
                            createHeaderCell("情绪标签", palette.amberSoft, 16, palette.amber),
                            createHeaderCell("强度", palette.amberSoft, 12, palette.amber),
                            createHeaderCell("情节点", palette.amberSoft, 42, palette.amber),
                            createHeaderCell("伏笔", palette.amberSoft, 30, palette.amber),
                        ]
                    })
                ];

                evt.plotPoints.forEach(point => {
                    plotPointRows.push(new TableRow({
                        children: [
                            createBodyCell(point.emotionalTag || "未标注", { width: 16, align: AlignmentType.CENTER, fill: "FFFCF5" }),
                            createBodyCell(typeof point.emotionalScore === 'number' ? `${point.emotionalScore}分` : "无", { width: 12, align: AlignmentType.CENTER }),
                            createBodyCell(point.description, { width: 42 }),
                            createBodyCell(point.foreshadowing || "无", { width: 30, fill: "FFFDF8" }),
                        ]
                    }));
                });

                children.push(createTableBlock(plotPointRows));
            }

            const worldviewItems = [
                ["体系", safeText(evt.worldview?.powerSystem)],
                ["物品", safeText(evt.worldview?.items)],
                ["地图 / 势力", safeText(evt.worldview?.geography)],
                ["异兽 / NPC", safeText(evt.worldview?.monsters)],
            ].filter(([, value]) => value !== "无");

            if (worldviewItems.length > 0) {
                children.push(createParagraph("设定补充", {
                    color: palette.blue,
                    bold: true,
                    size: 22,
                    spacingBefore: 120,
                    spacingAfter: 70,
                }));
                children.push(createKeyValueTable(worldviewItems as Array<[string, string]>, palette.blueSoft, palette.blue));
            }

            const goldenFingerItems = [
                ["定义", safeText(evt.goldenFinger?.definition)],
                ["本段作用", safeText(evt.goldenFinger?.impact)],
                ["代价 / 限制", safeText(evt.goldenFinger?.cost)],
                ["破规则方式", safeText(evt.goldenFinger?.ruleBreaker)],
            ].filter(([, value]) => value !== "无");

            if (goldenFingerItems.length > 0) {
                children.push(createParagraph("金手指", {
                    color: palette.amber,
                    bold: true,
                    size: 22,
                    spacingBefore: 120,
                    spacingAfter: 70,
                }));
                children.push(createKeyValueTable(goldenFingerItems as Array<[string, string]>, palette.amberSoft, palette.amber));
            }

            if (evt.quotes && evt.quotes.length > 0) {
                children.push(createParagraph("金句", {
                    color: palette.pink,
                    bold: true,
                    size: 22,
                    spacingBefore: 120,
                    spacingAfter: 70,
                }));
                children.push(createTableBlock([
                    new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 100, type: WidthType.PERCENTAGE },
                                shading: { fill: palette.pinkSoft },
                                margins: { top: 130, bottom: 130, left: 180, right: 180 },
                                borders: {
                                    top: createBorder(),
                                    bottom: createBorder(),
                                    right: createBorder(),
                                    left: createBorder(palette.pink, 6),
                                },
                                children: createListParagraphs(evt.quotes.map(quote => `“${safeText(quote)}”`), palette.slate),
                            })
                        ]
                    })
                ]));
            }

            children.push(createDivider());
        });
    });

    children.push(...createSectionTitle(
        "三、动态人物档案",
        palette.purple,
        "静态身份与阶段状态拆开看，更适合编剧和策划直接翻阅。",
        true
    ));

    if (!characters.length) {
        children.push(createEmptyState("暂无人物档案数据"));
    }

    characters.forEach((char, charIndex) => {
        children.push(new Paragraph({
            pageBreakBefore: charIndex > 0,
            spacing: { before: charIndex > 0 ? 0 : 120, after: 80 },
            children: [
                new TextRun({ text: safeText(char.name), bold: true, color: palette.text, size: 30 }),
                new TextRun({ text: `  ｜  ${safeText(char.role)}`, bold: true, color: palette.purple, size: 20 }),
            ],
        }));

        children.push(createInfoCard("人物简介", char.bio || "无", palette.purple, palette.purpleSoft));

        const staticRows = [
            new TableRow({ children: [createHeaderCell("人物名称", palette.purpleSoft, 2200, palette.purple, WidthType.DXA), createBodyCell(char.name || "未命名", { width: 8240, widthType: WidthType.DXA })] }),
            new TableRow({ children: [createHeaderCell("性别", palette.purpleSoft, 2200, palette.purple, WidthType.DXA), createBodyCell(char.gender || "未知", { width: 8240, widthType: WidthType.DXA })] }),
            new TableRow({ children: [createHeaderCell("籍贯 / 种族", palette.purpleSoft, 2200, palette.purple, WidthType.DXA), createBodyCell(char.origin || "未知", { width: 8240, widthType: WidthType.DXA })] }),
            new TableRow({ children: [createHeaderCell("功能定位", palette.purpleSoft, 2200, palette.purple, WidthType.DXA), createBodyCell(char.role || "未定义", { width: 8240, widthType: WidthType.DXA })] }),
            new TableRow({ children: [createHeaderCell("阶段数量", palette.purpleSoft, 2200, palette.purple, WidthType.DXA), createBodyCell(`${char.timeline?.length || 0}`, { width: 8240, widthType: WidthType.DXA })] }),
            new TableRow({ children: [createHeaderCell("动态状态", palette.purpleSoft, 2200, palette.purple, WidthType.DXA), createBodyCell(char.timeline?.length ? "已建立时间轴" : "暂无时间轴", { width: 8240, widthType: WidthType.DXA })] }),
        ];
        children.push(createTableBlock(staticRows, { columnWidths: [2200, 8240] }));

        if (!char.timeline || char.timeline.length === 0) {
            children.push(createEmptyState("暂无动态阶段数据"));
            children.push(createDivider());
            return;
        }

        children.push(createParagraph("阶段时间轴", {
            color: palette.purple,
            bold: true,
            size: 24,
            spacingBefore: 160,
            spacingAfter: 90,
        }));

        char.timeline.forEach((stage, index) => {
            children.push(createParagraph(
                `阶段 ${index + 1}：${safeText(stage.stageName || `阶段 ${index + 1}`)}${stage.sourceRange ? `（${stage.sourceRange}）` : ""}`,
                {
                    color: palette.purple,
                    bold: true,
                    size: 22,
                    spacingBefore: 130,
                    spacingAfter: 70,
                }
            ));

            const relationParagraphs = stage.relations && stage.relations.length > 0
                ? stage.relations.map(rel => new Paragraph({
                    bullet: { level: 0 },
                    spacing: { after: 40 },
                    children: [
                        new TextRun({ text: `${safeText(rel.target)}：`, bold: true, color: palette.text, size: 21 }),
                        new TextRun({ text: `${safeText(rel.attitude)}${hasText(rel.subtext) ? `（${safeText(rel.subtext)}）` : ''}`, color: palette.text, size: 21 })
                    ],
                }))
                : [createParagraph("无", { color: palette.muted, italics: true, spacingAfter: 0 })];

            const stageRows = [
                createPairRow(
                    "阶段序号",
                    `${typeof stage.stageIndex === 'number' ? stage.stageIndex + 1 : index + 1}`,
                    "章节范围",
                    stage.sourceRange || "无",
                    palette.slateSoft
                ),
                createPairRow(
                    "起始章节",
                    stage.startChapter > 0 ? `第${stage.startChapter}章` : "无",
                    "结束章节",
                    stage.endChapter > 0 ? `第${stage.endChapter}章` : "无",
                    palette.slateSoft
                ),
                createPairRow("当前年龄", stage.currentAge || "未知", "视觉年龄", stage.visualAgeDesc || "无", palette.slateSoft),
                createPairRow("外观特征", stage.appearance || "无", "身体状态", stage.physicalState || "无", palette.slateSoft),
                createPairRow("标志性道具", stage.signatureProps || "无", "核心目标", stage.coreGoal || "无", palette.slateSoft),
                createPairRow("已知信息", formatList(stage.knownInfo, "；"), "说话风格", stage.speakingStyle || "无", palette.slateSoft),
                new TableRow({
                    children: [
                        createHeaderCell("性格标签", palette.slateSoft, PAIR_COLUMN_WIDTHS[0], palette.slate, WidthType.DXA),
                        createBodyCell(formatList(stage.personalityTags, "、"), { width: PAIR_COLUMN_WIDTHS[1], widthType: WidthType.DXA }),
                        createHeaderCell("关系矩阵", palette.slateSoft, PAIR_COLUMN_WIDTHS[2], palette.slate, WidthType.DXA),
                        createBodyCell(relationParagraphs, { width: PAIR_COLUMN_WIDTHS[3], widthType: WidthType.DXA }),
                    ]
                })
            ];

            children.push(createTableBlock(stageRows, { columnWidths: PAIR_COLUMN_WIDTHS }));
        });

        children.push(createDivider());
    });

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 720,
                        right: 720,
                        bottom: 720,
                        left: 720,
                    },
                },
            },
            children,
        }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, getSafeExportFileName(novelName, '_IP解构案.docx'));
};

// --- Export IP Analysis ---

export const exportIpAnalysisToDocx = async (
    report: IpAnalysisReport,
    novelName: string
) => {
    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        Table,
        TableRow,
        TableCell,
        WidthType,
        BorderStyle,
        TableLayoutType,
        AlignmentType,
        saveAs,
    } = await loadDocxDeps();

    const formatStrategyLabel = (strategy: IpAnalysisReport['recommendation']['strategy']) => (
        strategy === 'high_fidelity' ? '高保真剧情压缩改编' : '剔骨剥皮式结构魔改'
    );

    const formatPerspectiveLabel = (perspective?: IpAnalysisReport['narrativePerspective']) => {
        if (!perspective) return '无';
        return perspective.recommended === 'first-person' ? '第一人称解说' : '第三人称演绎';
    };

    const formatDramaStyleLabel = (style?: IpAnalysisReport['aiDramaStyle']) => {
        if (!style) return '无';
        if (style.recommended === '2d_anime') return '2D动漫';
        if (style.recommended === '3d_anime') return '3D动漫';
        return 'AI仿真人';
    };

    const palette = {
        text: "1F2937",
        muted: "64748B",
        border: "E5E7EB",
        slate: "475569",
        slateSoft: "F8FAFC",
        indigo: "4F46E5",
        indigoSoft: "EEF2FF",
        purple: "7C3AED",
        purpleSoft: "F5F3FF",
        emerald: "059669",
        emeraldSoft: "ECFDF5",
        amber: "D97706",
        amberSoft: "FFFBEB",
        orange: "C2410C",
        orangeSoft: "FFF7ED",
        rose: "E11D48",
        roseSoft: "FFF1F2",
        blue: "2563EB",
        blueSoft: "EFF6FF",
    };

    const CONTENT_WIDTH = 10440;
    const createBorder = (color: string = palette.border, size: number = 1) => ({
        style: BorderStyle.SINGLE,
        size,
        color,
    });
    const defaultCellBorders = {
        top: createBorder(),
        bottom: createBorder(),
        left: createBorder(),
        right: createBorder(),
    };

    const createParagraph = (
        text: string,
        options: {
            color?: string;
            bold?: boolean;
            italics?: boolean;
            size?: number;
            alignment?: any;
            spacingAfter?: number;
            spacingBefore?: number;
        } = {}
    ) => new Paragraph({
        alignment: options.alignment,
        spacing: {
            before: options.spacingBefore,
            after: options.spacingAfter ?? 60,
        },
        children: [new TextRun({
            text: text || '无',
            color: options.color ?? palette.text,
            bold: options.bold,
            italics: options.italics,
            size: options.size,
        })],
    });

    const createSectionTitle = (title: string, color: string, subtitle?: string) => {
        const nodes = [
            new Paragraph({
                spacing: { before: 320, after: subtitle ? 40 : 180 },
                children: [new TextRun({ text: title, bold: true, color, size: 30 })],
            }),
        ];

        if (subtitle) {
            nodes.push(createParagraph(subtitle, {
                color: palette.muted,
                italics: true,
                size: 19,
                spacingAfter: 180,
            }));
        }

        return nodes;
    };

    const createTableBlock = (
        rows: any[],
        columnWidths?: number[],
        width: number = CONTENT_WIDTH
    ) => new Table({
        width: { size: width, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        alignment: AlignmentType.LEFT,
        indent: { size: 0, type: WidthType.DXA },
        columnWidths,
        rows,
    });

    const createHeaderCell = (
        text: string,
        fill: string,
        width: number,
        color: string,
        widthType: any = WidthType.PERCENTAGE
    ) => new TableCell({
        width: { size: width, type: widthType },
        shading: { fill },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders: defaultCellBorders,
        children: [createParagraph(text, {
            bold: true,
            color,
            size: 21,
            alignment: AlignmentType.CENTER,
            spacingAfter: 0,
        })],
    });

    const createBodyCell = (
        content: string | any[],
        options: {
            width?: number;
            widthType?: any;
            fill?: string;
            align?: any;
        } = {}
    ) => new TableCell({
        width: options.width ? { size: options.width, type: options.widthType || WidthType.PERCENTAGE } : undefined,
        shading: options.fill ? { fill: options.fill } : undefined,
        margins: { top: 110, bottom: 110, left: 120, right: 120 },
        borders: defaultCellBorders,
        children: Array.isArray(content)
            ? content
            : [createParagraph(content || '无', {
                alignment: options.align,
                size: 21,
                spacingAfter: 0,
            })],
    });

    const createInfoCard = (
        label: string,
        text: string,
        accentColor: string,
        fill: string = "FFFFFF"
    ) => createTableBlock([
        new TableRow({
            children: [
                new TableCell({
                    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                    shading: { fill },
                    margins: { top: 150, bottom: 150, left: 180, right: 180 },
                    borders: {
                        top: createBorder(),
                        bottom: createBorder(),
                        right: createBorder(),
                        left: createBorder(accentColor, 6),
                    },
                    children: [
                        createParagraph(label, {
                            color: accentColor,
                            bold: true,
                            size: 21,
                            spacingAfter: 70,
                        }),
                        ...String(text || '无').split('\n').filter(Boolean).map((line, index, arr) => createParagraph(line, {
                            color: line === "无" ? palette.muted : palette.text,
                            italics: line === "无",
                            size: 21,
                            spacingAfter: index === arr.length - 1 ? 0 : 55,
                        })),
                    ]
                })
            ]
        })
    ], [CONTENT_WIDTH]);

    const createListParagraphs = (items: string[], color: string = palette.text) => {
        const normalized = items.map(item => item.trim()).filter(Boolean);
        if (normalized.length === 0) {
            return [createParagraph("无", { color: palette.muted, italics: true, spacingAfter: 0 })];
        }

        return normalized.map(item => new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            children: [new TextRun({ text: item, color, size: 21 })],
        }));
    };

    const createSummaryTable = (items: Array<[string, string]>) => {
        const widths = [1800, 3420, 1800, 3420];
        const rows: any[] = [];
        for (let index = 0; index < items.length; index += 2) {
            const [leftLabel, leftValue] = items[index];
            const [rightLabel, rightValue] = items[index + 1] || ["", ""];
            rows.push(new TableRow({
                children: [
                    createHeaderCell(leftLabel, palette.indigoSoft, widths[0], palette.indigo, WidthType.DXA),
                    createBodyCell(leftValue, { width: widths[1], widthType: WidthType.DXA }),
                    createHeaderCell(rightLabel || " ", palette.indigoSoft, widths[2], palette.indigo, WidthType.DXA),
                    createBodyCell(rightValue || " ", { width: widths[3], widthType: WidthType.DXA }),
                ]
            }));
        }
        return createTableBlock(rows, widths);
    };

    const getScorePalette = (score: number) => {
        if (score >= 85) return { fill: palette.emeraldSoft, color: palette.emerald };
        if (score >= 70) return { fill: palette.blueSoft, color: palette.blue };
        if (score >= 55) return { fill: palette.amberSoft, color: palette.amber };
        if (score >= 40) return { fill: palette.orangeSoft, color: palette.orange };
        return { fill: palette.roseSoft, color: palette.rose };
    };

    const children: any[] = [];
    const exportDate = new Date(report.timestamp || Date.now()).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    children.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 80 },
            children: [new TextRun({
                text: `《${novelName || '未命名项目'}》`,
                bold: true,
                color: palette.text,
                size: 38,
            })],
        }),
        createParagraph("IP 价值分析报告", {
            alignment: AlignmentType.CENTER,
            color: palette.indigo,
            bold: true,
            size: 26,
            spacingAfter: 40,
        }),
        createParagraph("尽量还原线上展示逻辑的导出版式，便于复盘评分、策略与改编方向。", {
            alignment: AlignmentType.CENTER,
            color: palette.muted,
            italics: true,
            size: 18,
            spacingAfter: 180,
        }),
        createSummaryTable([
            ["项目名称", novelName || '未命名项目'],
            ["导出时间", exportDate],
            ["综合评分", `${report.totalScore} 分`],
            ["短剧适配度", `${report.shortDramaCompatibility} 分`],
            ["改编策略", formatStrategyLabel(report.recommendation.strategy)],
            ["策略置信度", `${Math.round((report.recommendation.confidence || 0) * 100)}%`],
        ])
    );

    children.push(
        ...createSectionTitle('一、核心结论', palette.indigo, '对应线上顶部的综合评分、综合评价与核心建议区域。')
    );
    children.push(createTableBlock([
        new TableRow({
            children: [
                new TableCell({
                    width: { size: 2600, type: WidthType.DXA },
                    shading: { fill: palette.indigoSoft },
                    margins: { top: 180, bottom: 180, left: 180, right: 180 },
                    borders: defaultCellBorders,
                    children: [
                        createParagraph("IP 价值综合评分", {
                            color: palette.muted,
                            bold: true,
                            size: 18,
                            alignment: AlignmentType.CENTER,
                            spacingAfter: 80,
                        }),
                        createParagraph(String(report.totalScore), {
                            color: getScorePalette(report.totalScore).color,
                            bold: true,
                            size: 56,
                            alignment: AlignmentType.CENTER,
                            spacingAfter: 80,
                        }),
                        createParagraph(`短剧适配度 ${report.shortDramaCompatibility} 分`, {
                            color: palette.indigo,
                            bold: true,
                            size: 22,
                            alignment: AlignmentType.CENTER,
                            spacingAfter: 0,
                        }),
                    ],
                }),
                new TableCell({
                    width: { size: 7840, type: WidthType.DXA },
                    margins: { top: 0, bottom: 0, left: 0, right: 0 },
                    borders: {
                        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                    },
                    children: [
                        createInfoCard("综合评价", report.summary, palette.blue, palette.blueSoft),
                        createInfoCard("核心建议", `${formatStrategyLabel(report.recommendation.strategy)}\n${report.recommendation.reasoning}`, palette.amber, palette.amberSoft),
                    ],
                }),
            ],
        }),
    ], [2600, 7840]));

    const recommendationRows: any[] = [
        new TableRow({
            children: [
                createHeaderCell("推荐叙事角度", palette.emeraldSoft, 2200, palette.emerald, WidthType.DXA),
                createBodyCell(formatPerspectiveLabel(report.narrativePerspective), { width: 3000, widthType: WidthType.DXA }),
                createHeaderCell("推荐 AI 短剧形态", palette.purpleSoft, 2200, palette.purple, WidthType.DXA),
                createBodyCell(formatDramaStyleLabel(report.aiDramaStyle), { width: 3040, widthType: WidthType.DXA }),
            ],
        }),
    ];
    children.push(createTableBlock(recommendationRows, [2200, 3000, 2200, 3040]));

    children.push(...createSectionTitle('二、维度详细评分', palette.indigo, '对应线上维度详细评估区域，保留评分层次与评语。'));
    children.push(createTableBlock([
            new TableRow({
                children: [
                    createHeaderCell('维度', palette.indigoSoft, 2200, palette.indigo, WidthType.DXA),
                    createHeaderCell('分数', palette.indigoSoft, 1200, palette.indigo, WidthType.DXA),
                    createHeaderCell('评语', palette.indigoSoft, 7040, palette.indigo, WidthType.DXA),
                ],
            }),
            ...report.dimensionScores.map(item => new TableRow({
                children: [
                    createBodyCell(item.dimension, { width: 2200, widthType: WidthType.DXA }),
                    createBodyCell(`${item.score}`, {
                        width: 1200,
                        widthType: WidthType.DXA,
                        align: AlignmentType.CENTER,
                        fill: getScorePalette(item.score).fill,
                    }),
                    createBodyCell(item.comment, { width: 7040, widthType: WidthType.DXA }),
                ],
            })),
        ], [2200, 1200, 7040]));

    if (report.aiDramaStyle) {
        children.push(
            ...createSectionTitle('三、AI 短剧类型适配度', palette.purple, '对应线上 AI 短剧类型适配度卡片。'),
            createInfoCard(
                `推荐类型：${formatDramaStyleLabel(report.aiDramaStyle)}`,
                `2D动漫：${report.aiDramaStyle.scores['2d_anime']} 分\n3D动漫：${report.aiDramaStyle.scores['3d_anime']} 分\nAI仿真人：${report.aiDramaStyle.scores['ai_realistic']} 分\n\n${report.aiDramaStyle.reasoning}`,
                palette.purple,
                palette.purpleSoft
            )
        );
    }

    if (report.narrativePerspective) {
        children.push(
            ...createSectionTitle('四、叙事角度建议', palette.emerald, '对应线上叙事角度推荐卡片。'),
            createInfoCard(
                `推荐视角：${formatPerspectiveLabel(report.narrativePerspective)}`,
                report.narrativePerspective.reasoning,
                palette.emerald,
                palette.emeraldSoft
            )
        );
    }

    children.push(...createSectionTitle('五、优势与改进空间', palette.indigo, '对应线上优势 / 改进空间双栏区域。'));
    children.push(createTableBlock([
        new TableRow({
            children: [
                new TableCell({
                    width: { size: 5100, type: WidthType.DXA },
                    shading: { fill: palette.emeraldSoft },
                    margins: { top: 150, bottom: 150, left: 180, right: 180 },
                    borders: {
                        top: createBorder(),
                        bottom: createBorder(),
                        right: createBorder(),
                        left: createBorder(palette.emerald, 6),
                    },
                    children: [
                        createParagraph("小说优势", {
                            color: palette.emerald,
                            bold: true,
                            size: 24,
                            spacingAfter: 90,
                        }),
                        ...createListParagraphs(report.strengths, palette.emerald),
                    ],
                }),
                new TableCell({
                    width: { size: 5340, type: WidthType.DXA },
                    shading: { fill: palette.orangeSoft },
                    margins: { top: 150, bottom: 150, left: 180, right: 180 },
                    borders: {
                        top: createBorder(),
                        bottom: createBorder(),
                        right: createBorder(),
                        left: createBorder(palette.orange, 6),
                    },
                    children: [
                        createParagraph("改进空间", {
                            color: palette.orange,
                            bold: true,
                            size: 24,
                            spacingAfter: 90,
                        }),
                        ...createListParagraphs(report.weaknesses, palette.orange),
                    ],
                }),
            ],
        }),
    ], [5100, 5340]));

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 720,
                        right: 720,
                        bottom: 720,
                        left: 720,
                    },
                },
            },
            children,
        }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, getSafeExportFileName(novelName, '_IP价值分析报告.docx'));
};

// --- Export Outline (Step 2) ---

export const exportOutlineToDocx = async (
    episodes: Episode[], 
    novelName: string
) => {
    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        Table,
        TableRow,
        TableCell,
        WidthType,
        saveAs,
    } = await loadDocxDeps();
    const children: any[] = [];

    children.push(
        new Paragraph({
            text: `《${novelName || "未命名项目"}》短剧分集大纲`,
            heading: HeadingLevel.TITLE,
            alignment: "center",
            spacing: { after: 400 },
        })
    );

    episodes.forEach(ep => {
        // Header
        children.push(
            new Paragraph({
                text: ep.title,
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 300, after: 100 }
            })
        );
        children.push(new Paragraph({
            children: [new TextRun({ text: `对应原著: ${ep.targetChapter}`, italics: true, color: "757575" })],
            spacing: { after: 200 }
        }));

        // Content
        children.push(new Paragraph({
            children: [new TextRun({ text: "【剧情梗概】", bold: true })],
            spacing: { after: 50 }
        }));
        children.push(new Paragraph({
            text: ep.content,
            spacing: { after: 200 }
        }));

        // Hooks Table
        const rows = [];
        if (ep.draftOpeningHook) {
            rows.push(new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "开篇钩子", bold: true })] })], width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: "FFF8E1" } }),
                    new TableCell({ children: [new Paragraph(ep.draftOpeningHook)] }),
                ]
            }));
        }
        if (ep.viralTips) {
            rows.push(new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "创作技巧", bold: true })] })], width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: "E8EAF6" } }),
                    new TableCell({ children: [new Paragraph(ep.viralTips)] }),
                ]
            }));
        }
        // REMOVED: draftTone
        if (ep.draftKeyQuotes) {
            rows.push(new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "关键台词", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph(ep.draftKeyQuotes)] }),
                ]
            }));
        }
        if (ep.draftCharacterList && ep.draftCharacterList.length > 0) {
             const charNames = ep.draftCharacterList.map(c => c.name).join("、");
             rows.push(new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "出场人物", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph(charNames)] }),
                ]
            }));
        }

        if (rows.length > 0) {
            children.push(new Table({
                rows: rows,
                width: { size: 100, type: WidthType.PERCENTAGE },
            }));
        }
    });

    const doc = new Document({
        sections: [{ properties: {}, children: children }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, getSafeExportFileName(novelName, '_分集大纲.docx'));
};

// --- Export Script (Step 4/Audit) ---
export const exportScriptToDocx = async (script: string, title: string) => {
    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        saveAs,
    } = await loadDocxDeps();
    const lines = script.split('\n');
    const children = lines.map(line => {
        // Simple heuristic for formatting
        let bold = false;
        let alignment = "left";
        let size = 24; // 12pt

        if (line.trim().match(/^【?第.+集】?$/)) {
             bold = true;
             size = 32; // 16pt
             alignment = "center";
        } else if (line.trim().match(/^\d+-\d+/)) {
             bold = true;
        }

        return new Paragraph({
            children: [
                new TextRun({
                    text: line,
                    bold: bold,
                    size: size,
                })
            ],
            alignment: alignment as any
        });
    });

    const doc = new Document({
        sections: [{ properties: {}, children: children }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, getSafeExportFileName(title, '.docx'));
}
