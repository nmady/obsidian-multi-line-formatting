import { 
  App, Plugin, PluginSettingTab, Setting, MarkdownView, CacheItem, EditorPosition, ListItemCache, HeadingCache
} from 'obsidian';
import NRDoc from './doc';

const PLUGIN_NAME = "Multi-line Formatting"

interface MultilineFormattingPluginSettings {
  nickname: string;
	leftStyle: string;
  rightStyle: string;
  skipHeadings: boolean;
  skipListItems: boolean;
  skipBlockquotes: boolean;
}

const DEFAULT_SETTINGS: MultilineFormattingPluginSettings = {
  nickname: 'Format, even over multiple lines',
	leftStyle: '<span style="background-color:#00FEFE">',
  rightStyle: '</span>',
  skipHeadings: false,
  skipListItems: false,
  skipBlockquotes: false
}

export default class MultilineFormattingPlugin extends Plugin {
	settings: MultilineFormattingPluginSettings;
  NRDoc: NRDoc;


	async onload() {
		console.log('Loading ' + PLUGIN_NAME + ' Plugin');

		await this.loadSettings();

    this.NRDoc = new NRDoc();

		this.addCommand({
			id: 'multi-line-format',
			name: this.settings.nickname,
			callback: () => {
        this.editModeGuard(async () => await this.formatSelection())
			}
		});

		this.addSettingTab(new MultilineFormattingSettingTab(this.app, this));

	}

	onunload() {
		console.log('Unloading ' + PLUGIN_NAME + 'Plugin');
	}

  editModeGuard(command: () => any): void {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView;
    if(!mdView || mdView.getMode() !== 'source') {
      new Notification('Please use ' + PLUGIN_NAME + ' plugin in edit mode');
      return;
    } else {
      command();
    }
  }

  async formatSelection(): Promise<void> {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView;
    if(!mdView) {return}
    const doc = mdView.editor;

    const cache = this.app.metadataCache.getCache(mdView.file.path)
    const sections = cache.sections
    const headings = cache.headings
    const listItems = cache.listItems
    
    const selectedContent = this.NRDoc.selectedContent(doc);
    if(selectedContent.length <= 0) { 
      return 
    }
    console.debug('Sections', sections)
    console.debug('ListItems', listItems)
    console.debug('Original selectedContent:', selectedContent)

    /* We're going to apply the rightStyle at the very end because sometimes
      headers close a block unexpectedly, in which case have to look to the block
      preceding and apply the rightStyle after the initial loop through.
      applyRightArray[i] == true means we apply rightStyle to selectedContent[i] */
    const applyRightArray: boolean[] = new Array(selectedContent.length)
    applyRightArray.fill(false);

    /* If there is no text in the line to format (empty line or only heading/list
       prefix) then we don't want to append the rightStyle after the fact*/
    const isFormatEmpty: boolean[] = new Array(selectedContent.length)
    isFormatEmpty.fill(false);
    
    /* The next (non-empty) line after a heading embedded in a list needs 
      leftStyle applied. */
    let isAfterEmbeddedParaBreak = false

    let previousBlockquoteLevel = 0;

    const selectionStartCursor = doc.getCursor('from');

    let currentSectionIndex = sectionBinarySearch(selectionStartCursor.line, sections);

    for (let i=0; i < selectedContent.length; i++) {
      console.debug('Starting line', i, 'now, with content:', selectedContent[i])
      /* Reset applyLeft to false after each iteration. This variable lets us set
      a 'left' edge between a heading/list prefix, and only apply formatting to
      lines where there is selected content to the right of that left edge. */ 
      let applyLeft = false

      const selectionStartCol = (i > 0) ? 0 : selectionStartCursor.ch  

      if (selectedContent[i] === ""){
        isFormatEmpty[i] = true;
        console.debug("empty line:", isFormatEmpty)
      }
      const lineNo = i + selectionStartCursor.line
      console.debug("Lineno:", lineNo, "Section:", currentSectionIndex)
      const originalLine = doc.getLine(lineNo)
      console.debug("Full line:", originalLine)
      let left = 0

      while (sections[currentSectionIndex].position.end.line < lineNo){
        currentSectionIndex++;
      }

      let isBlockEnd = false;

      if (sections[currentSectionIndex].type === "paragraph") {
        console.debug("paragraph")
        if (!isFormatEmpty[i]){
          const whitespaceMatch = selectedContent[i].match(/^(\s*)(.*)/)
          console.debug(whitespaceMatch)
          selectedContent[i] = whitespaceMatch[1] + this.settings.leftStyle + whitespaceMatch[2]
          /* jump to the end of the paragraph */
          i = sections[currentSectionIndex].position.end.line - selectionStartCursor.line
          console.debug('i', i)
          // lineNo = i + selectionStartCursor.line;
          applyRightArray[i] = true
          continue
        }
      } else if (sections[currentSectionIndex].type === "heading") {
        console.debug("heading");
        if (this.settings.skipHeadings) {
          isFormatEmpty[i] = true;
          console.debug('skipping Heading')
          continue
        } 
        const text = headings[sectionBinarySearch(lineNo, headings)].heading
        console.debug(text)
        left = originalLine.lastIndexOf(text)
        if (left > 0) applyLeft = true;
        console.debug('left in heading:', left)
        applyRightArray[i] = true
      } else if (sections[currentSectionIndex].type === "blockquote") {
        console.debug("blockquote")
        if (this.settings.skipBlockquotes) {
          isFormatEmpty[i] = true;
          console.debug('skipping Blockquote')
          continue
        }
        /* if this is the first line of the Blockquote */
        if (sections[currentSectionIndex].position.start.line == lineNo || isAfterEmbeddedParaBreak) {
          applyLeft = true
          console.debug('Applying left because this is the first line')
          isAfterEmbeddedParaBreak = false
        }

        /* The prefix for a blockquote is some combination of whitespace and >*/
        const blockquoteMatch = originalLine.match(/^([\s>]*)(.*)/)
        const prefix = blockquoteMatch[1];
        const text = blockquoteMatch[2];
        const blockquoteLevel = prefix.split('>').length-1
        console.debug('bq-level:', blockquoteLevel, 'previous:', previousBlockquoteLevel)
        if (previousBlockquoteLevel < blockquoteLevel) {
          applyLeft = true
          const k = rewindToFalse(isFormatEmpty, i)
          if (k >= 0) {applyRightArray[k] = true}
          previousBlockquoteLevel = blockquoteLevel
        } 
        if (text.length == 0) {
          isFormatEmpty[i] = true
          const k = rewindToFalse(isFormatEmpty, i-1)
          if (k >= 0) {
            applyRightArray[k] = true
          }
          isAfterEmbeddedParaBreak = true
        }
        left = prefix.length
        console.debug('left after removing prefix:', left)
        if (sections[currentSectionIndex].position.end.line == lineNo) applyRightArray[i] = true
      } else if (sections[currentSectionIndex].type === "list") {
        console.debug("list")
        if (this.settings.skipListItems) {
          isFormatEmpty[i] = true;
          console.debug('skipping List Item')
          continue
        } 
        if (isAfterEmbeddedParaBreak) { 
          console.debug("line is after list heading")
          if (!isFormatEmpty[i]) {
            applyLeft = true;
            isAfterEmbeddedParaBreak = false;
          }
        } else applyLeft = false

        let listIndex = sectionBinarySearch(lineNo, listItems)
        const lineTrimmed = originalLine
        const listItem = listItems[listIndex]
        console.debug('item ', listIndex, 'found via binary search', listItem)
        /* if this is the first line of the ListItem */
        if (listItem.position.start.line == lineNo){
          applyLeft = true
          while (listItems[listIndex].position.start.col > selectionStartCol) {
            console.debug("List item starts in col", listItems[listIndex].position.start.col, " which is to the right of where the selection starts,", selectionStartCol, "so the selection is probably in the preceding list item.")
            listIndex--;
          }
          while (listIndex+1 < listItems.length && listItems[listIndex+1].position.start.line === lineNo && listItems[listIndex+1].position.start.col < selectionStartCol) {
            console.debug("The start of the selected part of this line seems to be after the start of the next list item.")
            console.debug("liststart", listItems[listIndex].position.start.col)
            console.debug("selectionStart", selectionStartCol)
            listIndex++;
          }
          while (true) {
            console.debug('listIndex', listIndex)
            const listItem = listItems[listIndex]
            left = listItems[listIndex].position.start.col
            console.debug('left:', left)
            // let subLine = originalLine.substring(left)
            if (typeof(listItem.task) != 'undefined') {
              /* List item with a task */
              const startUntrimmed = originalLine.substring(left).indexOf(listItem.task.concat(']')) + 2
              left += startUntrimmed
              const subLine = originalLine.substring(left)
              const subLineTrimmed = subLine.trimStart()
              left += subLine.length - subLineTrimmed.length
              console.debug('text,' + subLine)
              console.debug('left,', left)
            } else {
              /* Taskless list items */
              const prefix = originalLine.substring(left).match(/^\s*(\*|-|\d+\.)\s*/)[0]
              console.debug('prefix:', prefix)
              left += prefix.length
              console.debug('left after removing prefix:', left)
            }
            
            if (listIndex + 1 < listItems.length && listItems[listIndex + 1].position.start.line === lineNo && listItems[listIndex + 1].position.start.col <= left){
              listIndex++;
              console.debug('listIndex', listIndex)
            } else {
              console.debug(lineTrimmed)
              break
            }
          }
        } else {
          console.debug('not first line')
          left = originalLine.length - originalLine.trimStart().length;
        }
        const headingMatch = originalLine.substring(left).match(/^\s*#{1,6}\s+/)
        if (headingMatch != null) {
          console.debug("This is a heading inside a list.")
          applyLeft = true;
          applyRightArray[i] = true;
          if (i - 1 >= 0) applyRightArray[i-1] = true;
          isAfterEmbeddedParaBreak = true;
          left += headingMatch[0].length
          console.debug('left', left)
        }

        if (listItem.position.end.line === lineNo){
          isBlockEnd = true;
          console.debug("end of listItem")
          if (isFormatEmpty[i]) {
            console.debug("isFormatEmpty")
            let k = i;
            while (k >= 0 && isFormatEmpty[k]) {
              k--;
              console.debug('k:', k)
            }
            if (!isFormatEmpty[k]) {applyRightArray[k] = true;}
          } else applyRightArray[i] = true
        } else console.debug("Not end of listitem.")
  
      } else {
        console.debug("not sure what this is", sections[currentSectionIndex].type)
        isFormatEmpty[i] = true
      }

      if (sections[currentSectionIndex].position.end.line === lineNo || i >= selectedContent.length - 1 || isBlockEnd){
        const k = rewindToFalse(isFormatEmpty, i)
        if (k >= 0) applyRightArray[k] = true
      }

      console.debug("Time to applyLeft")
      if (applyLeft) {
        console.debug('left at application:', left)
        if (left <= selectionStartCol) {
          selectedContent[i] = this.settings.leftStyle.concat(selectedContent[i])
        } else {
          const formatable = selectedContent[i].substring(left - selectionStartCol)
          if (formatable === "") {
            isFormatEmpty[i] = true;
            continue
          }
          selectedContent[i] = selectedContent[i].substring(0, left - selectionStartCol).concat(this.settings.leftStyle).concat(formatable)
        }
      }
    applyLeft = false
    } /* end for loop over all lines of selectedContent indexed by i */

    for (let i=0; i<selectedContent.length; i++) {
      if (applyRightArray[i] && !isFormatEmpty[i]) {
        selectedContent[i] = selectedContent[i].concat(this.settings.rightStyle)
      }
    }

    doc.replaceSelection(selectedContent.join('\n'));

  }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function rewindToFalse(boolArray: boolean[], startIndex: number): number {
  let k = startIndex;
  while (k >= 0 && boolArray[k]) {
    k--;
    console.debug('k:', k)
  }
  return k;
}

function sectionBinarySearch(line: number, sections: CacheItem[]): number {
  let low = 0
  let high = sections.length
  while (low < high){
    const midpoint = low + ((high - low) >> 1)
    console.debug(low, high)
    console.debug(midpoint)
    const midposition = sections[midpoint].position
    if (line < midposition.start.line){
      /* cursor before middle section */
      high = midpoint
    } else if (line <= midposition.end.line){
      /* cursor in middle section */
      return midpoint
    } else {
      /* cursor after middle section */
      low = midpoint + 1
    }
  }
  /* this might not be the right thing to do. */
  return low
}



class MultilineFormattingSettingTab extends PluginSettingTab {
	plugin: MultilineFormattingPlugin;

	constructor(app: App, plugin: MultilineFormattingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for ' + PLUGIN_NAME});

    new Setting(containerEl)
			.setName('Nickname')
			.setDesc('The name for your formatting command in the command palette.')
			.addText(text => text
				// .setPlaceholder('')
				.setValue(this.plugin.settings.nickname)
				.onChange(async (value) => {
					this.plugin.settings.nickname = value;
          this.plugin.addCommand({
            id: 'multi-line-format',
            name: this.plugin.settings.nickname,
            callback: () => {
              this.plugin.editModeGuard(async () => await this.plugin.formatSelection())
            }
          });
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Left')
			.setDesc('The opening tag, or the left part of a highlight (==), bold (**), etc.')
			.addTextArea(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.leftStyle)
				.onChange(async (value) => {
					this.plugin.settings.leftStyle = value;
					await this.plugin.saveSettings();
				}));

    new Setting(containerEl)
      .setName('Right')
      .setDesc('The closing tag, or the right part of a highlight (==), bold (**), etc.')
      .addTextArea(text => text
        .setPlaceholder('')
        .setValue(this.plugin.settings.rightStyle)
        .onChange(async (value) => {
          this.plugin.settings.rightStyle = value;
          await this.plugin.saveSettings();
        }));

    const skipDetails: HTMLDetailsElement = containerEl.createEl("details");
    skipDetails.createEl("summary", { text: "Skip some section types" });
    
    new Setting(skipDetails)
      .setName('Skip List Items')
      .setDesc('Turn this toggle ON to exclude text in list items.')
      .addToggle((t) => {
        t.setValue(this.plugin.settings.skipListItems);
        t.onChange(async (v) => {
          this.plugin.settings.skipListItems = v;
          await this.plugin.saveSettings();
        })
      });
    
    new Setting(skipDetails)
        .setName('Skip Headings')
        .setDesc('Turn this toggle ON to exclude text in headings.')
        .addToggle((t) => {
          t.setValue(this.plugin.settings.skipHeadings);
          t.onChange(async (v) => {
            this.plugin.settings.skipHeadings = v;
            await this.plugin.saveSettings();
          })
        });

    new Setting(skipDetails)
        .setName('Skip Blockquotes')
        .setDesc('Turn this toggle ON to exclude text in Blockquotes. (OFF Disabled, since Blockquote formatting in development!)')
        .addToggle((t) => {
          t.setValue(this.plugin.settings.skipBlockquotes);
          t.onChange(async (v) => {
            this.plugin.settings.skipBlockquotes = v;
            await this.plugin.saveSettings();
          })
        });
	}
}