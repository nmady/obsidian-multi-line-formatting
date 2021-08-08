import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from "constants";
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownView,
  CacheItem,
  SectionCache,
  Editor,
} from "obsidian";
import { start } from "repl";

const PLUGIN_NAME = "Multi-line Formatting";

interface MultilineFormattingPluginSettings {
  styleArray: MultilineFormattingStyleSettings[];
}

interface MultilineFormattingStyleSettings {
  id: string;
  nickname: string;
  leftStyle: string;
  rightStyle: string;
  skipHeadings: boolean;
  skipListItems: boolean;
  skipBlockquotes: boolean;
}

const DEFAULT_SETTINGS: MultilineFormattingPluginSettings = {
  styleArray: [
    {
      id: "multi-line-format-cyan-highlight",
      nickname: "Cyan Highlighter, even over multiple lines",
      leftStyle: '<span style="background-color:#00FEFE">',
      rightStyle: "</span>",
      skipHeadings: false,
      skipListItems: false,
      skipBlockquotes: false,
    },
    {
      id: "multi-line-format-bold",
      nickname: "Bold, even over multiple lines",
      leftStyle: "**",
      rightStyle: "**",
      skipHeadings: false,
      skipListItems: false,
      skipBlockquotes: false,
    },
  ],
};

const NEW_STYLE_DEFAULTS: MultilineFormattingStyleSettings = {
  id: "",
  nickname: "Empty format",
  leftStyle: "",
  rightStyle: "",
  skipHeadings: false,
  skipListItems: false,
  skipBlockquotes: false,
};

export default class MultilineFormattingPlugin extends Plugin {
  settings: MultilineFormattingPluginSettings;

  async onload() {
    console.log("Loading " + PLUGIN_NAME + " Plugin");

    await this.loadSettings();

    for (const style of this.settings.styleArray) {
      this.addStyleCommand(style);
    }

    this.addSettingTab(new MultilineFormattingSettingTab(this.app, this));
  }

  onunload() {
    console.log("Unloading " + PLUGIN_NAME + "Plugin");
  }

  formatSelection(
    editor: Editor,
    style: MultilineFormattingStyleSettings
  ): void {
    const formatter = new Formatter(style);

    formatter.formatSelection(editor);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  addStyleCommand(style: MultilineFormattingStyleSettings) {
    this.addCommand({
      id: style.id,
      name: style.nickname,
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        this.formatSelection(editor, style);
      },
    });
  }

  addFormattingStyle() {
    const id = String(
      Math.abs((Date.now() ^ (Math.random() * (1 << 30))) % (1 << 30))
    );
    const newStyle = { ...NEW_STYLE_DEFAULTS, id: id };
    this.settings.styleArray.push(newStyle);
    this.addStyleCommand(newStyle);
    return newStyle;
  }

  deleteFormattingStyle(style: MultilineFormattingStyleSettings) {
    const index = this.settings.styleArray.indexOf(style);
    if (index >= 0) {
      this.settings.styleArray.splice(index, 1);
    }
    //@ts-ignore
    const appCommands = this.app.commands;
    if (appCommands.findCommand(style.id)) {
      delete appCommands.editorCommands[style.id];
      delete appCommands.commands[style.id];
    }
  }
}

function sectionBinarySearch(line: number, sections: CacheItem[]): number {
  let low = 0;
  let high = sections.length;
  while (low < high) {
    const midpoint = low + ((high - low) >> 1);
    const midposition = sections[midpoint].position;
    if (line < midposition.start.line) {
      /* cursor before middle section */
      high = midpoint;
    } else if (line <= midposition.end.line) {
      /* cursor in middle section */
      return midpoint;
    } else {
      /* cursor after middle section */
      low = midpoint + 1;
    }
  }
  /* this might not be the right thing to do. */
  return low;
}

class MultilineFormattingSettingTab extends PluginSettingTab {
  plugin: MultilineFormattingPlugin;

  constructor(app: App, plugin: MultilineFormattingPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Settings for " + PLUGIN_NAME });

    const allStyleDiv = containerEl.createEl("div");

    for (const style of this.plugin.settings.styleArray) {
      const div = this.formattingStyleSetting(style);
      allStyleDiv.appendChild(div);
    }

    new Setting(containerEl).addButton((t) => {
      t.setButtonText("Add new formatting style");
      t.onClick(async (v) => {
        const newStyle = this.plugin.addFormattingStyle();
        const div = this.formattingStyleSetting(newStyle);
        allStyleDiv.appendChild(div);
      });
    });
  }

  formattingStyleSetting(style: MultilineFormattingStyleSettings) {
    const containerEl = document.createElement("div");

    const commandheader = containerEl.createEl("h3", {
      text: "Settings for " + style.nickname,
    });

    new Setting(containerEl)
      .setName("Nickname")
      .setDesc("The name for your formatting command in the command palette.")
      .addText((text) =>
        text
          // .setPlaceholder('')
          .setValue(style.nickname)
          .onChange(async (value) => {
            style.nickname = value;
            commandheader.setText("Settings for " + style.nickname);
            this.plugin.addStyleCommand(style);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Left")
      .setDesc(
        "The opening tag, or the left part of a highlight (==), bold (**), etc."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("")
          .setValue(style.leftStyle)
          .onChange(async (value) => {
            style.leftStyle = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Right")
      .setDesc(
        "The closing tag, or the right part of a highlight (==), bold (**), etc."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("")
          .setValue(style.rightStyle)
          .onChange(async (value) => {
            style.rightStyle = value;
            await this.plugin.saveSettings();
          })
      );

    // const skipDetails: HTMLDetailsElement = containerEl.createEl("details");
    // skipDetails.createEl("summary", { text: "Skip some section types" });

    // new Setting(skipDetails)
    //   .setName('Skip List Items')
    //   .setDesc('Turn this toggle ON to exclude text in list items.')
    //   .addToggle((t) => {
    //     t.setValue(style.skipListItems);
    //     t.onChange(async (v) => {
    //       style.skipListItems = v;
    //       await this.plugin.saveSettings();
    //     })
    //   });

    new Setting(containerEl)
      .setName("Skip Headings")
      .setDesc("Turn this toggle ON to exclude text in headings.")
      .addToggle((t) => {
        t.setValue(style.skipHeadings);
        t.onChange(async (v) => {
          style.skipHeadings = v;
          await this.plugin.saveSettings();
        });
      });

    // new Setting(skipDetails)
    //     .setName('Skip Blockquotes')
    //     .setDesc('Turn this toggle ON to exclude text in blockquotes.')
    //     .addToggle((t) => {
    //       t.setValue(style.skipBlockquotes);
    //       t.onChange(async (v) => {
    //         style.skipBlockquotes = v;
    //         await this.plugin.saveSettings();
    //       })
    //     });

    new Setting(containerEl).addButton((t) => {
      t.setButtonText("Delete this style");
      t.onClick(async (v) => {
        if (
          confirm("Are you sure you want to delete " + style.nickname + "?")
        ) {
          containerEl.parentElement?.removeChild(containerEl);
          this.plugin.deleteFormattingStyle(style);
        }
      });
    });

    return containerEl;
  }
}

type SectionType =
  | "paragraph"
  | "heading"
  | "list"
  | "blockquote"
  | "fence"
  | "indent";

const HEADING_REGEX = /^(?<prefix> {0,3}#{1,6}\s+)(?<remainder>.*)$/;
const BLOCKQUOTE_REGEX = /^(?<prefix> {0,3}>\s*)(?<remainder>.*)$/;
const LIST_REGEX =
  /^(?<prefix> {0,3}(\*|-|\d+\.)\s+(\[.\]\s+)?)(?<remainder>.*)$/;
const CODE_INDENT_REGEX = /^(?<prefix> {4}|\t)(?<remainder>.*)$/;
const CODE_FENCE_OPEN_REGEX = /^(?<prefix> {0,3}(`{3}|~{3}))(?<remainder>.*)$/;
const CODE_FENCE_CLOSE_REGEX =
  /^(?<prefix> {0,3}(`{3}|~{3}))(?<remainder>\s*)$/;
const LEFT_TRIM_REGEX = /^(?<prefix>\s*)(?<remainder>.*)$/;
const WHITESPACE_ONLY_REGEX = /^\s*$/;

class Formatter {
  replacement: string[];
  style: MultilineFormattingStyleSettings;
  lastNonEmptyIndex: number;
  isPrecededByParagraphBreak: boolean;
  previousBlockquoteLevel: number;
  blockquoteLevelSoFar: number;
  previousListLevel: number;
  listLevelSoFar: number;
  fenceOpen: boolean;

  constructor(style: MultilineFormattingStyleSettings) {
    this.replacement = [];
    this.style = style;
    this.lastNonEmptyIndex = -1;
    this.isPrecededByParagraphBreak = true;
    this.previousBlockquoteLevel = 0;
    this.blockquoteLevelSoFar = 0;
    this.previousListLevel = 0;
    this.listLevelSoFar = 0;
    this.fenceOpen = false;
  }

  formatSelection(doc: Editor): void {
    const start = doc.getCursor("from");
    const end = doc.getCursor("to");

    if (start === end) {
      doc.replaceSelection(this.style.leftStyle + this.style.rightStyle);
      doc.setCursor(start.line, start.ch + this.style.leftStyle.length);
      return;
    }

    for (let lineNum = 0; lineNum <= end.line; lineNum++) {
      const line = doc.getLine(lineNum);
      console.debug(line);
      this.blockquoteLevelSoFar = 0;

      const startCh = lineNum == start.line ? start.ch : 0;
      const endCh = lineNum == end.line ? end.ch : line.length;

      const parsedLineType = getLineType(line);
      const formattedLine = this.processLine(
        line,
        startCh,
        endCh,
        parsedLineType
      );

      if (lineNum >= start.line) {
        console.debug("Formatting", line);
        this.replacement.push(formattedLine);
      }
    }

    this.applyRightAbove();

    doc.replaceSelection(this.getReplacement());
  }

  getReplacement() {
    return this.replacement.join("\n");
  }

  processRemainder(remainder: string, startCh: number, endCh: number): string {
    // if (this.fenceOpen) {
    //   console.debug("fenceOpen is true");
    //   const fenceMatch = remainder.match(CODE_FENCE_CLOSE_REGEX);
    //   console.debug("fenceMatch: ", fenceMatch, "remain:", remainder);
    //   if (fenceMatch != null) {
    //     console.debug("closing fence");
    //     this.fenceOpen = false;
    //   }
    //   return remainder.substring(startCh, endCh);
    // }

    const lineType = getLineType(remainder);
    return this.processLine(remainder, startCh, endCh, lineType);
  }

  processLine(
    line: string,
    startCol: number,
    endCol: number,
    lineType: LineType
  ): string {
    const { desc, prefix, remainder } = lineType;

    if (desc === "blockquote") {
      this.blockquoteLevelSoFar += 1;
    }

    if (desc === "list") {
      this.listLevelSoFar += 1;
    }

    return (
      prefix.substring(startCol, endCol) +
      this[desc](remainder, startCol - prefix.length, endCol - prefix.length)
    );
  }

  blockquote(remainder: string, startCh: number, endCh: number): string {
    console.debug(
      "bq-level:",
      this.blockquoteLevelSoFar,
      "previous:",
      this.previousBlockquoteLevel
    );

    if (
      this.fenceOpen &&
      this.previousBlockquoteLevel == this.blockquoteLevelSoFar
    ) {
      console.debug("applying paragraph to", remainder);
      return this.paragraph(remainder, startCh, endCh);
    }

    if (this.previousBlockquoteLevel < this.blockquoteLevelSoFar) {
      this.isPrecededByParagraphBreak = true;
      this.applyRightAbove();
      this.previousBlockquoteLevel = this.blockquoteLevelSoFar;
    }

    return this.processRemainder(remainder, startCh, endCh);
  }

  heading(remainder: string, startCh: number, endCh: number) {
    console.debug("This is a heading");

    const selectedRemainder = remainder.substring(startCh, endCh);

    this.applyRightAbove();

    this.isPrecededByParagraphBreak = true;

    if (
      selectedRemainder.search(WHITESPACE_ONLY_REGEX) >= 0 ||
      this.style.skipHeadings
    ) {
      return selectedRemainder;
    } else {
      this.setCurrentLineNonEmpty();
      return this.style.leftStyle + selectedRemainder;
    }
  }

  list(remainder: string, startCh: number, endCh: number): string {
    this.isPrecededByParagraphBreak = true;

    return this.processRemainder(remainder, startCh, endCh);
  }

  paragraph(remainder: string, startCh: number, endCh: number): string {
    if (remainder == "") {
      this.isPrecededByParagraphBreak = true;
      if (this.fenceOpen && this.previousBlockquoteLevel > 0) {
        console.debug("Closing fence");
        this.fenceOpen = false;
      }
      this.previousBlockquoteLevel = this.blockquoteLevelSoFar;
      return remainder;
    } else if (
      remainder.substring(startCh, endCh).search(WHITESPACE_ONLY_REGEX) >= 0 ||
      this.fenceOpen
    ) {
      return remainder.substring(startCh, endCh);
    } else {
      let returnable: string;
      if (this.isPrecededByParagraphBreak) {
        this.isPrecededByParagraphBreak = false;
        this.applyRightAbove();
        returnable = this.style.leftStyle + remainder.substring(startCh, endCh);
      } else {
        returnable = remainder.substring(startCh, endCh);
      }

      this.setCurrentLineNonEmpty();
      return returnable;
    }
  }

  fence(remainder: string, startCh: number, endCh: number): string {
    if (this.fenceOpen && remainder.match(WHITESPACE_ONLY_REGEX)) {
      console.debug("closing fence");
      this.fenceOpen = false;
      this.isPrecededByParagraphBreak = true;
    } else {
      console.debug("opening fence");
      this.fenceOpen = true;
    }
    return remainder.substring(startCh, endCh);
  }

  indent(remainder: string, startCh: number, endCh: number): string {
    const { prefix, trimmed } = remainder.match(LEFT_TRIM_REGEX).groups;
    if (!this.isPrecededByParagraphBreak || trimmed == "") {
      return this.paragraph(
        trimmed,
        startCh - prefix.length,
        endCh - prefix.length
      );
    } else {
      return remainder.substring(startCh, endCh);
    }
  }

  setCurrentLineNonEmpty() {
    this.lastNonEmptyIndex = this.replacement.length;
  }

  applyRightAbove(): boolean {
    if (this.lastNonEmptyIndex >= 0 && this.replacement.length > 0) {
      const [, rightTrimmed, endWhitespace] =
        this.replacement[this.lastNonEmptyIndex].match(/^(.*?)(\s*)$/);
      this.replacement[this.lastNonEmptyIndex] =
        rightTrimmed + this.style.rightStyle + endWhitespace;
      this.lastNonEmptyIndex = -1;
      return true;
    } else return false;
  }
}

interface LineType {
  desc: SectionType;
  prefix: string;
  remainder: string;
}

function getLineType(line: string): LineType {
  const indentMatch = line.match(CODE_INDENT_REGEX);
  if (indentMatch != null) {
    const { prefix, remainder } = indentMatch.groups;
    return { desc: "indent", prefix, remainder };
  }
  const headingMatch = line.match(HEADING_REGEX);
  if (headingMatch != null) {
    const { prefix, remainder } = headingMatch.groups;
    return { desc: "heading", prefix, remainder };
  }
  const listMatch = line.match(LIST_REGEX);
  if (listMatch != null) {
    const { prefix, remainder } = listMatch.groups;
    return { desc: "list", prefix, remainder };
  }
  const blockquoteMatch = line.match(BLOCKQUOTE_REGEX);
  if (blockquoteMatch != null) {
    const { prefix, remainder } = blockquoteMatch.groups;
    return { desc: "blockquote", prefix, remainder };
  }
  const fenceMatch = line.match(CODE_FENCE_OPEN_REGEX);
  if (fenceMatch != null) {
    const { prefix, remainder } = fenceMatch.groups;
    console.debug("fence: '" + prefix + "', '" + remainder + "'");
    return { desc: "fence", prefix, remainder };
  }
  const { prefix, remainder } = line.match(LEFT_TRIM_REGEX).groups;
  return { desc: "paragraph", prefix, remainder };
}
