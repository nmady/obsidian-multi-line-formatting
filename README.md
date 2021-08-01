## Obsidian Multi-line Formatting Plugin 

This plugin is designed to offer formatting over an entire selection, even if that selection has paragraph breaks in the middle! However, this plugin is new and has only had limited testing. I am grateful for your patience and your bug reports!

## Usage

Select the text you want to format, and use the command **Format, even over multiple lines** (you can change this command name and what kind of formatting to apply in Settings). Be careful not to start or end your selection in the middle of another type of paired formatting (e.g. bold, italics, highlighting, etc.)

## Settings

Two formatting styles exist by default. To add a new frormatting style, scroll to the bottom of the settings pane and click the **Add formatting style** button.

For each fromatting style, you can enter the formatting you want to apply as **Left** and **Right**. You can change the Nickname of the command so that the name in the command palette better reflects the kind of formatting you choose.

If you want to **Skip some section types** for a particular formatting style, open the collapsible section below it in Settings, and you can toggle those "skip" settings for Headings, Blockquotes, and List Items.

## Limitations

Again, this is an early version of this plugin which has had limited testing. Help me improve it by reporting any unexpected behaviour. However, note that currently list items and headings embedded in blockquotes and blockquotes embedded in list items will not be formatted correctly. Code block sections are skipped, but code blocks embedded in list items or blockquotes are not formatted correctly. 

### Planned Features

- Handle all embedded list items, blockquotes, and headings.

## Bug reports and feature requests appreciated!

Please let me know how this plugin can be improved.

### Acknowledgements

A huge thank you to **lynchjames**, whose [Note Refactor Plugin](https://github.com/lynchjames/note-refactor-obsidian) formed the base for this plugin, and to **THeK3nger** for the [Obsidian Plugin Template](https://github.com/THeK3nger/obsidian-plugin-template), and to [roshanshariff](https://github.com/roshanshariff) for help debugging and refactoring!
