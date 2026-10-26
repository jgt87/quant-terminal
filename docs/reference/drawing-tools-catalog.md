# Drawing tools catalog (summary)

Human-readable index of `drawing-tools-catalog.json` (full field lists, choices, defaults) and `drawing-menus.json` (menus, toolbars). Facts only, gathered from live observation of the web chart on 2026-10-13 (English UI, dark theme). Defaults are **factory defaults** (the account in the browser has its own saved defaults, which were not used).

- Tools in catalog: **99** (83 with settings read from the live dialog definitions, 2 from static reading, 14 with settings unknown).
- Field counts below: *all* = every field incl. Coordinates and Visibility tabs; *style/text/inputs* = excluding those two generic tabs.
- Every tool except the noted gaps has the 20-field Visibility tab (Ticks, Seconds, Minutes, Hours, Days, Weeks, Months with from/to ranges, Ranges).

| Family | Tools | With settings | Fields (all) | Fields (style/text/inputs) |
|---|---|---|---|---|
| Chart patterns | 6 | 6 | 228 | 44 |
| Volume-based | 3 | 0 | 0 | 0 |
| Shapes | 10 | 10 | 303 | 75 |
| Arrows | 4 | 4 | 135 | 43 |
| Not in drawing toolbar | 9 | 3 | 87 | 25 |
| Forecasting | 6 | 5 | 192 | 88 |
| Brushes | 2 | 2 | 48 | 8 |
| Text and notes | 10 | 10 | 297 | 75 |
| Cycles | 3 | 3 | 83 | 11 |
| Lines | 9 | 9 | 358 | 153 |
| Measurers | 3 | 3 | 130 | 58 |
| Channels | 4 | 3 | 153 | 88 |
| Elliott waves | 5 | 5 | 172 | 20 |
| Icons | 3 | 3 | 61 | 1 |
| Fibonacci | 11 | 11 | 933 | 665 |
| Gann | 4 | 4 | 371 | 275 |
| Content | 3 | 0 | 0 | 0 |
| Pitchforks | 4 | 4 | 316 | 212 |

## Chart patterns

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| XABCD pattern | `LineTool5PointsPattern` | 5 |  | Style (8), Coordinates (10), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |
| ABCD pattern | `LineToolABCD` | 4 |  | Style (6), Coordinates (8), Visibility (20) | — | line-tool-color, text-color, line-tool-width |
| Cypher pattern | `LineToolCypherPattern` | 5 |  | Style (8), Coordinates (10), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |
| Head and shoulders | `LineToolHeadAndShoulders` | 7 |  | Style (8), Coordinates (14), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |
| Three drives pattern | `LineToolThreeDrivers` | 7 |  | Style (6), Coordinates (14), Visibility (20) | — | line-tool-color, text-color, line-tool-width |
| Triangle pattern | `LineToolTrianglePattern` | 4 |  | Style (8), Coordinates (8), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |

## Volume-based

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Anchored VWAP | `LineToolAnchoredVWAP` | unknown |  | unknown | unknown | unknown |
| Anchored volume profile | `LineToolAnchoredVolumeProfile` | unknown |  | unknown | unknown | unknown |
| Fixed range volume profile | `LineToolFixedRangeVolumeProfile` | unknown |  | unknown | unknown | unknown |

## Shapes

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Arc | `LineToolArc` | 3 |  | Style (4), Visibility (20) | — | line-tool-color, background-color, line-tool-width |
| Double curve | `LineToolBezierCubic` | 2 |  | Style (9), Coordinates (8), Visibility (20) | — | line-tool-color, line-tool-width, style |
| Curve | `LineToolBezierQuadro` | 2 |  | Style (9), Coordinates (6), Visibility (20) | — | line-tool-color, line-tool-width, style |
| Circle | `LineToolCircle` | 2 |  | Style (4), Text (5), Coordinates (4), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |
| Ellipse | `LineToolEllipse` | 3 |  | Style (4), Text (5), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |
| Path | `LineToolPath` | variable |  | Style (5), Visibility (20) | — | line-tool-color, line-tool-width, style |
| Polyline | `LineToolPolyline` | variable |  | Style (4), Visibility (20) | — | line-tool-color, background-color, line-tool-width, style |
| Rectangle | `LineToolRectangle` | 2 | Alt + Shift + R | Style (11), Text (7), Coordinates (4), Visibility (20) | — (+Add alert) | line-tool-color, background-color, text-color, line-tool-width, style, add-alert |
| Rotated rectangle | `LineToolRotatedRectangle` | 3 |  | Style (4), Visibility (20) | — | line-tool-color, background-color, line-tool-width |
| Triangle | `LineToolTriangle` | 3 |  | Style (4), Coordinates (6), Visibility (20) | — | line-tool-color, background-color, line-tool-width |

## Arrows

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Arrow | `LineToolArrow` | 2 |  | Style (18), Text (7), Coordinates (4), Visibility (20) | — (+Add alert) | line-tool-color, text-color, line-tool-width, style, add-alert |
| Arrow mark down | `LineToolArrowMarkDown` | 1 |  | Style (1), Text (5), Coordinates (2), Visibility (20) | — | line-tool-color, text-color |
| Arrow mark up | `LineToolArrowMarkUp` | 1 |  | Style (1), Text (5), Coordinates (2), Visibility (20) | — | line-tool-color, text-color |
| Arrow marker | `LineToolArrowMarker` | 2 |  | Style (1), Text (5), Coordinates (4), Visibility (20) | — | background-color, text-color |

## Not in drawing toolbar

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| arrow mark left | `LineToolArrowMarkLeft` | unknown |  | unknown | unknown | unknown |
| arrow mark right | `LineToolArrowMarkRight` | unknown |  | unknown | unknown | unknown |
| balloon | `LineToolBalloon` | 1 |  | Text (5), Coordinates (2), Visibility (20) | — | text-color, background-color, font-size |
| Elliott wave (legacy) | `LineToolElliott` | unknown |  | unknown | unknown | unknown |
| anchored note | `LineToolNoteAbsolute` | 1 |  | Style (1), Text (9), Visibility (20) | Anchor | line-tool-color, text-color, font-size, toggle-anchor |
| Order (trading) | `LineToolOrder` | unknown |  | unknown | unknown | unknown |
| Position (trading) | `LineToolPosition` | unknown |  | unknown | unknown | unknown |
| Anchored text | `LineToolTextAbsolute` | 1 |  | Text (10), Visibility (20) | Anchor | text-color, font-size, toggle-anchor |
| Volume profile fixed range | `LineToolVbPFixed` | unknown |  | unknown | unknown | unknown |

## Forecasting

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Bars pattern | `LineToolBarsPattern` | 2 |  | Style (4), Visibility (20) | Mirrored, Flipped | background-color |
| Ghost feed | `LineToolGhostFeed` | variable |  | unknown | — | (base only) |
| Position forecast | `LineToolPrediction` | 2 |  | Style (12), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width |
| Sector | `LineToolProjection` | 3 |  | Style (4), Visibility (20) | — | background-color, background-color, line-tool-width |
| Long position | `LineToolRiskRewardLong` | 2 |  | Inputs (12), Style (22), Visibility (20) | unknown | unknown |
| Short position | `LineToolRiskRewardShort` | 2 |  | Inputs (12), Style (22), Visibility (20) | unknown | unknown |

## Brushes

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Brush | `LineToolBrush` | variable |  | Style (6), Visibility (20) | — | line-tool-color, line-tool-width |
| Highlighter | `LineToolHighlighter` | variable |  | Style (2), Visibility (20) | — | line-tool-color, highlighter-width |

## Text and notes

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Callout | `LineToolCallout` | 2 |  | Text (9), Coordinates (4), Visibility (20) | — | text-color, background-color, font-size |
| Comment | `LineToolComment` | 1 |  | Text (5), Coordinates (2), Visibility (20) | — | text-color, background-color, font-size |
| Flag mark | `LineToolFlagMark` | 1 |  | Style (1), Coordinates (2), Visibility (20) | — | background-color |
| Pin | `LineToolNote` | 1 |  | Style (1), Text (9), Coordinates (2), Visibility (20) | Anchor | line-tool-color, text-color, font-size, toggle-anchor |
| Price label | `LineToolPriceLabel` | 1 |  | Style (4), Coordinates (2), Visibility (20) | — | text-color, background-color, font-size |
| Price note | `LineToolPriceNote` | 2 |  | Style (7), Text (7), Coordinates (4), Visibility (20) | — | line-tool-color, background-color, text-color |
| Signpost | `LineToolSignpost` | 1 |  | Style (3), Text (4), Coordinates (2), Visibility (20) | — | font-size |
| Table | `LineToolTable` | 1 |  | Style (5), Visibility (20) | Add column to right, Add row below, Anchor | toggle-insert-cells-button-Chart.SelectedObject.InsertColumnTable, toggle-insert-cells-button-Chart.SelectedObject.InsertRowTable, line-tool-color, background-color, text-color, toggle-anchor |
| Text | `LineToolText` | 1 |  | Text (10), Visibility (20) | Anchor | text-color, font-size, toggle-anchor |
| Note | `LineToolTextNote` | 2 |  | Style (5), Text (5), Coordinates (4), Visibility (20) | — | line-tool-color, background-color, text-color |

## Cycles

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Cyclic lines | `LineToolCircleLines` | 2 |  | Style (3), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width |
| Sine line | `LineToolSineLine` | 2 |  | Style (3), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width, style |
| Time cycles | `LineToolTimeCycles` | 2 |  | Style (5), Coordinates (4), Visibility (20) | — | line-tool-color, background-color, line-tool-width, style |

## Lines

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Crossline | `LineToolCrossLine` | 1 | Alt + C | Style (5), Coordinates (2), Visibility (20) | — | line-tool-color, line-tool-width, style |
| Extended line | `LineToolExtended` | 2 |  | Style (18), Text (7), Coordinates (4), Visibility (20) | — (+Add alert) | line-tool-color, text-color, line-tool-width, style, add-alert |
| Horizontal line | `LineToolHorzLine` | 1 | Alt + H | Style (4), Text (7), Coordinates (1), Visibility (20) | — (+Add alert) | line-tool-color, text-color, line-tool-width, style, add-alert |
| Horizontal ray | `LineToolHorzRay` | 1 | Alt + J | Style (4), Text (7), Coordinates (2), Visibility (20) | — (+Add alert) | line-tool-color, text-color, line-tool-width, style, add-alert |
| Info line | `LineToolInfoLine` | 2 |  | Style (18), Text (7), Coordinates (4), Visibility (20) | — (+Add alert) | line-tool-color, text-color, line-tool-width, style, add-alert |
| Ray | `LineToolRay` | 2 |  | Style (18), Text (7), Coordinates (4), Visibility (20) | — (+Add alert) | line-tool-color, text-color, line-tool-width, style, add-alert |
| Trend angle | `LineToolTrendAngle` | 2 |  | Style (13), Coordinates (3), Visibility (20) | — (+Add alert) | line-tool-color, line-tool-width, style, add-alert |
| Trendline | `LineToolTrendLine` | 2 | Alt + T | Style (18), Text (7), Coordinates (4), Visibility (20) | — (+Add alert) | line-tool-color, text-color, line-tool-width, style, add-alert |
| Vertical line | `LineToolVertLine` | 1 | Alt + V | Style (5), Text (8), Coordinates (1), Visibility (20) | — (+Add alert) | line-tool-color, text-color, line-tool-width, style, add-alert |

## Measurers

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Date and price range | `LineToolDateAndPriceRange` | 2 |  | Style (17), Text (5), Coordinates (4), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |
| Date range | `LineToolDateRange` | 2 |  | Style (13), Text (5), Coordinates (4), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |
| Price range | `LineToolPriceRange` | 2 |  | Style (13), Text (5), Coordinates (4), Visibility (20) | — | line-tool-color, background-color, text-color, line-tool-width |

## Channels

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Disjoint channel | `LineToolDisjointAngle` | 3 |  | Style (14), Text (7), Visibility (20) | — (+Add alert) | line-tool-color, background-color, text-color, line-tool-width, style, add-alert |
| Flat top/bottom | `LineToolFlatBottom` | 3 |  | Style (14), Text (7), Visibility (20) | — (+Add alert) | line-tool-color, background-color, text-color, line-tool-width, style, add-alert |
| Parallel channel | `LineToolParallelChannel` | 3 |  | Style (39), Text (7), Coordinates (5), Visibility (20) | — (+Add alert) | line-tool-color, background-color, text-color, line-tool-width, add-alert |
| Regression trend | `LineToolRegressionTrend` | unknown |  | unknown | unknown | unknown |

## Elliott waves

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Elliott correction wave (A·B·C) | `LineToolElliottCorrection` | 4 |  | Style (4), Coordinates (8), Visibility (20) | Degree ▸ | line-tool-color, line-tool-width |
| Elliott double combo wave (W·X·Y) | `LineToolElliottDoubleCombo` | 4 |  | Style (4), Coordinates (8), Visibility (20) | Degree ▸ | line-tool-color, line-tool-width |
| Elliott impulse wave (1·2·3·4·5) | `LineToolElliottImpulse` | 6 |  | Style (4), Coordinates (12), Visibility (20) | Degree ▸ | line-tool-color, line-tool-width |
| Elliott triangle wave (A·B·C·D·E) | `LineToolElliottTriangle` | 6 |  | Style (4), Coordinates (12), Visibility (20) | Degree ▸ | line-tool-color, line-tool-width |
| Elliott triple combo wave (W·X·Y·X·Z) | `LineToolElliottTripleCombo` | 6 |  | Style (4), Coordinates (12), Visibility (20) | Degree ▸ | line-tool-color, line-tool-width |

## Icons

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Emoji | `LineToolEmoji` | 1 |  | Visibility (20) | — | (base only) |
| Icon | `LineToolIcon` | 1 |  | Style (1), Visibility (20) | — | background-color |
| Sticker | `LineToolSticker` | 1 |  | Visibility (20) | — | (base only) |

## Fibonacci

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Fib channel | `LineToolFibChannel` | 3 |  | Style (85), Coordinates (6), Visibility (20) | — | line-tool-color |
| Fib circles | `LineToolFibCircles` | 2 |  | Style (53), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width |
| Fib retracement | `LineToolFibRetracement` | 2 | Alt + F | Style (94), Coordinates (4), Visibility (20) | — (+Add alert) | line-tool-color, line-tool-width, add-alert |
| Fib speed resistance arcs | `LineToolFibSpeedResistanceArcs` | 2 |  | Style (53), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width |
| Fib speed resistance fan | `LineToolFibSpeedResistanceFan` | 2 |  | Style (54), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width, style |
| Fib spiral | `LineToolFibSpiral` | 2 |  | Style (4), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width |
| Fib time zone | `LineToolFibTimeZone` | 2 |  | Style (61), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width, style |
| Fib wedge | `LineToolFibWedge` | 3 |  | Style (51), Visibility (20) | — | line-tool-color, line-tool-width |
| Pitchfan | `LineToolPitchfan` | 3 |  | Style (51), Coordinates (6), Visibility (20) | — | line-tool-color, line-tool-width |
| Trend-based fib extension | `LineToolTrendBasedFibExtension` | 3 |  | Style (94), Coordinates (6), Visibility (20) | — (+Add alert) | line-tool-color, line-tool-width, add-alert |
| Trend-based fib time | `LineToolTrendBasedFibTime` | 3 |  | Style (65), Coordinates (6), Visibility (20) | — | line-tool-color, line-tool-width |

## Gann

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Gann square | `LineToolGannComplex` | 2 |  | Style (93), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width |
| Gann fan | `LineToolGannFan` | 2 |  | Style (40), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width |
| Gann square fixed | `LineToolGannFixed` | 2 |  | Style (88), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width |
| Gann box | `LineToolGannSquare` | 2 |  | Style (54), Coordinates (4), Visibility (20) | — | line-tool-color, line-tool-width, style |

## Content

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Idea | `LineToolIdea` | unknown |  | unknown | unknown | unknown |
| Image | `LineToolImage` | unknown |  | unknown | unknown | (base only) |
| Post | `LineToolTweet` | unknown |  | unknown | unknown | unknown |

## Pitchforks

| Tool | Type | Anchors | Hotkey | Tabs | Context-menu extras | Floating toolbar |
|---|---|---|---|---|---|---|
| Inside pitchfork | `LineToolInsidePitchfork` | 3 |  | Style (53), Coordinates (6), Visibility (20) | Original, Schiff, Modified Schiff, Inside | line-tool-color, line-tool-width |
| Pitchfork | `LineToolPitchfork` | 3 |  | Style (53), Coordinates (6), Visibility (20) | Original, Schiff, Modified Schiff, Inside | line-tool-color, line-tool-width |
| Modified Schiff pitchfork | `LineToolSchiffPitchfork` | 3 |  | Style (53), Coordinates (6), Visibility (20) | Original, Schiff, Modified Schiff, Inside | line-tool-color, line-tool-width |
| Schiff pitchfork | `LineToolSchiffPitchfork2` | 3 |  | Style (53), Coordinates (6), Visibility (20) | Original, Schiff, Modified Schiff, Inside | line-tool-color, line-tool-width |

Floating toolbar column lists only the tool-specific buttons; every toolbar also has templates, settings, lock, remove and more.

## Gaps and unknowns

- **Anchored VWAP** (`LineToolAnchoredVWAP`): harvest notes: defaults:Assertion failed: Java studies metainfo should be define here not instantiated live; settings tabs / menus could not be read at runtime Implemented as a study-backed line tool; its settings dialog (Inputs/Style/Visibility) is generated from server-delivered study metadata, which did not load in this session. Fields unknown.
- **Anchored volume profile** (`LineToolAnchoredVolumeProfile`): harvest notes: defaults:Assertion failed: Java studies metainfo should be define here not instantiated live; settings tabs / menus could not be read at runtime Implemented as a study-backed line tool; its settings dialog (Inputs/Style/Visibility) is generated from server-delivered study metadata, which did not load in this session. Fields unknown.
- **arrow mark left** (`LineToolArrowMarkLeft`): not instantiated live; settings tabs / menus could not be read at runtime Registered tool without API shape name and not listed in the drawing toolbar; not instantiated.
- **arrow mark right** (`LineToolArrowMarkRight`): not instantiated live; settings tabs / menus could not be read at runtime Registered tool without API shape name and not listed in the drawing toolbar; not instantiated.
- **Elliott wave (legacy)** (`LineToolElliott`): not instantiated live; settings tabs / menus could not be read at runtime Legacy Elliott tool (superseded by the five Elliott wave tools); not in toolbar; not instantiated.
- **Fixed range volume profile** (`LineToolFixedRangeVolumeProfile`): harvest notes: defaults:Assertion failed: Java studies metainfo should be define here not instantiated live; settings tabs / menus could not be read at runtime Implemented as a study-backed line tool; its settings dialog (Inputs/Style/Visibility) is generated from server-delivered study metadata, which did not load in this session. Fields unknown.
- **Ghost feed** (`LineToolGhostFeed`): Created live, but the settings dialog did not open for it (returned no dialog); settings unknown. Factory defaults known.
- **Idea** (`LineToolIdea`): not instantiated live; settings tabs / menus could not be read at runtime Content tool in the Annotation group (not a registry line tool); skipped.
- **Image** (`LineToolImage`): not instantiated live; settings tabs / menus could not be read at runtime Skipped: creation needs an uploaded image; settings unknown.
- **Order (trading)** (`LineToolOrder`): not instantiated live; settings tabs / menus could not be read at runtime Trading (broker) order line tool; not creatable through the drawing API; only factory defaults read.
- **Position (trading)** (`LineToolPosition`): not instantiated live; settings tabs / menus could not be read at runtime Trading (broker) position line tool; not creatable through the drawing API; only factory defaults read.
- **Regression trend** (`LineToolRegressionTrend`): harvest notes: defaults:Assertion failed: Java studies metainfo should be define here not instantiated live; settings tabs / menus could not be read at runtime Implemented as a study-backed line tool; its settings dialog (Inputs/Style/Visibility) is generated from server-delivered study metadata, which did not load in this session. Fields unknown.
- **Long position** (`LineToolRiskRewardLong`): not instantiated live; settings tabs / menus could not be read at runtime tab order Inputs/Style/Visibility inferred (not observed live)
- **Short position** (`LineToolRiskRewardShort`): not instantiated live; settings tabs / menus could not be read at runtime tab order Inputs/Style/Visibility inferred (not observed live)
- **Post** (`LineToolTweet`): not instantiated live; settings tabs / menus could not be read at runtime Content tool in the Annotation group (not a registry line tool); skipped.
- **Volume profile fixed range** (`LineToolVbPFixed`): harvest notes: defaults:Assertion failed: Java studies metainfo should be define here not instantiated live; settings tabs / menus could not be read at runtime Implemented as a study-backed line tool; its settings dialog (Inputs/Style/Visibility) is generated from server-delivered study metadata, which did not load in this session. Fields unknown.
- Choices for the risk/reward "Cash" mode value and the currency list depend on the symbol and were not observed.
- Factory default colours are theme-resolved for the current (dark) theme; tools with themed defaults may use different light-theme colours (see catalog factoryDefaults).
- `dependsOn` was found by toggling each boolean property and watching which definitions changed visibility/enabled state; dependencies triggered by non-boolean values (e.g. selects) were not probed.
- Line style choices offered in the dialog are Solid/Dotted/Dashed (values 0/1/2).
- The chart session's study metadata request never completed in this session, so study-backed tools (Anchored VWAP, Regression trend, volume profiles) and the Long/Short position live dialog could not be opened.
- Multi-selection menu was read from the menu builder (two drawings selected), not from a screenshot; a right-click on a multi-selection was not captured visually.
- Whether the left-toolbar group button tracks the last used tool was not verified.
