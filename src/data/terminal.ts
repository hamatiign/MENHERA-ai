const chalk = require("chalk");
const gradient = require("gradient-string");

export const colorThemes: any = {
    love: ["#deabf2", "#FFC2F7", "#8765e7", "#a7d7f1", "#CF55BE"],
    gratitude: ["#7AF0EA", "#87A9FA", "#B590E0", "#F792CB", "#F2BFAE"],
    happiness: ["#16da33", "#ee8863", "#eedd63", "#63eee0", "#B7F090"],
    serenity: ["#a7f1e4", "#4DF4FA", "#C79E52", "#A89736", "#FAE14D"],
    driven: ["#E0C887", "#33698A", "#ada5e9", "#e8885e", "#34c3df"],
    thoughtful: ["#57C7F7", "#2E8052", "#72CC9A", "#FFB0A8", "#71DECF"],
    spooky: ["#FAD64B", "#CCB481", "#EDAA53", "#665447", "#F77A52"],
    optimistic: ["#45D959", "#2D8C3A", "#41CC54", "#8CD971", "#1A5222"],
    rainbow: ["#14ff24", "#14e8ff", "#4b14ff", "#ff7ab4", "#ffd000"],
    mono: ["#EDEDED", "#A6A6A6", "#757575", "#C8CCC8", "#474747"],
    white: ["#ffff"],
    grey: ["#C8CCC8"],
};

export const borderThemes: any = {
    bamboo: [
        `<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>`,
        `--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--<>--`,
    ],
    waves: [
        `...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo..`,
        `oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oOo...oO`,
    ],
    simple: [
        `--------------------------------------------------------------------------`,
        `                                                                          `,
    ],
    fence: [
        `O----O----O----O----O----O----O----O----O----O----O----O----O----O----O----O`,
        `|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|`,
    ],
    frame: [
        `+------------------------------------------------------------------------+`,
        `|                                                                        |`,
    ],
    hearts1: [
        `♥♥♥♥♥♥♥♥♥♥♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥  ♥  ♥   ♥   ♥   ♥  ♥  ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥♥♥♥♥♥♥♥♥♥♥`,
        `♥♥♥ ♥ ♥ ♥ ♥ ♥ ♥  ♥  ♥  ♥   ♥   ♥    ♥    ♥   ♥   ♥  ♥  ♥  ♥ ♥ ♥ ♥ ♥ ♥ ♥♥♥`,
    ],
    hearts2: [
        `    <3     <3     <3     <3     <3     <3     <3     <3     <3     <3     `,
        `<3                                                                    <3  `,
    ],
    hearts3: [
        `----♥------♥------♥------♥------♥------♥------♥------♥------♥------♥------`,
        `<3     <3     <3     <3     <3     <3     <3     <3     <3     <3     <3  `,
    ],
    banner: [
        `'°º¤ø,.,ø¤°º¤ø,.,ø¤°'°º¤ø,.,ø¤°º¤ø,.,ø¤°'°º¤ø,.,ø¤°º¤ø,.,ø¤°'°º¤ø,.,ø¤°º¤ø`,
        `                                                                          `,
    ],
    boxy1: [
        `██████████████████████████████████████████████████████████████████████████`,
        `██████████████████████████████████████████████████████████████████████████`,
    ],
    boxy2: [
        `██████████████████████████████████████████████████████████████████████████`,
        ` ████████████████████████████████████████████████████████████████████████ `,
    ],
    dotty: [
        ` ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' ':' '`,
        `.: :.: :.: .:. .:. .:: :.: :.: ::. .:. .:. :.: :.: :.: .:. .:. .:: :.: :.:`,
    ],
};

export function createColorString(string: string, color: string, style: string) {
    if (style === "bold") return chalk.bold.hex(color)(string);
    else return chalk.hex(color)(string);
}

export function createGradString(string: string, grad: any) {
    return chalk.bold(grad(string));
}

// Adds spaces to the beginning of a string to center it within an area
export function centerString(string: string, areaLength: number) {
    let spaces = "";
    const numInsertSpaces = Math.ceil(areaLength - string.length) / 2;
    for (let i = 0; i < numInsertSpaces; i++) {
        spaces += " ";
    }
    return spaces + string;
}

export function createGrad(colors = colorThemes.love, loops = 2) {
    let colorsRepeat = [];
    let length = colors.length;
    for (let i = 0; i < loops * 2; i++) {
        for (let j = 0; j < length; j++) {
            if (i % 2 == 0) {
                colorsRepeat.push(colors[j]);
            } else {
                colorsRepeat.push(colors[length - j - 1]);
            }
        }
    }
    const gradFunc = typeof gradient === 'function' ? gradient : gradient.default;
    if (typeof gradFunc !== 'function') {
        throw new Error("gradient-string could not be loaded as a function");
    }
    return gradFunc(colorsRepeat);
}

export function getMenheraTerminalText(text: string, themeName: string = 'love') {
    const colors = colorThemes[themeName] || colorThemes.love;
    const border = borderThemes.hearts2;
    const grad = createGrad(colors, 2);
    
    const borderTop = createGradString(border[0], grad);
    const borderBottom = createGradString(border[1], grad);
    const centeredText = centerString(text, border[0].length);
    const coloredText = createColorString(centeredText, colors[0], "bold");

    return `\n${borderTop}\n${borderBottom}\n\n${coloredText}\n\n${borderBottom}\n${borderTop}\n`;
}
