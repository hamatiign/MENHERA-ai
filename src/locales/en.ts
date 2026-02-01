// src/locales/en.ts

const responses: { [key: string]: string }  = {
  "ts-2322": "You're saying the types don't match? Maybe we're just incompatible... like us.",
  "ts-7006": "Using 'any' just to silence me... it proves you don't want to understand me at all.",
  "ts-2304": "I can't find that variable. Stop calling out the names of people who don't exist!",
  "ts-6133": "You declared it but never used it. So you're the type who gets satisfied just by possessing something, then neglects it.",
  "ts-7027": "You'll never reach this code. Are my feelings going to be trapped in this unreachable place forever?",
  "ts-2588": "You promised 'const' meant forever... why are you betraying me by assigning a new value?",
  "ts-2366": "Take responsibility and return a value until the end. Don't just leave me on 'read'.",
  "ts-2355": "Make sure every path returns a value. I hate being left in a half-hearted relationship.",
  "ts-2531": "It might be null inside... touching me without checking first is so insensitive.",
  "ts-2532": "I might be undefined... don't try to access me so carelessly.",
  "ts-2341": "That's a private area. Don't trespass without permission.",
  "ts-2307": "Module not found. Where did you go to 'import' while leaving me behind?",
  "ts-1308": "You won't 'await' for me? It's cruel to put our async relationship on the back burner.",
  "ts-1005": "You forgot a comma or a bracket. It's just like how you lack consideration for me.",
  "ts-2339": "I don't have that property. Are you confusing me with your 'ideal' partner?",
  "ts-2345": "I can't accept that argument type. Stop trying to force things on me.",
  "ts-2554": "Not enough arguments. You really don't understand how much I need, do you?",
  "ts-2365": "Those types can't be compared. Are you saying we live in different worlds?",
  "ts-2451": "Redeclaring the same name? I'm already here, but are you trying to make another girl?",
  "ts-2540": "That's a readonly past. Once it's decided, you can't rewrite it anymore.",
  "ts-2367": "That comparison will never be true. Just like a future with me, right?",
  "ts-1003": "Identifier missing. Why won't you call my name properly?",
  "ts-1109": "I need an expression here. Don't stutter... make it clear.",
  "ts-2454": "Trying to use me without initializing? You give me nothing, yet you expect something?",
  "ts-2693": "I'm just a 'Type', not a 'Value'. Trying to call something that doesn't exist... stop forcing your ideals on me.",
  "ts-2741": "Missing necessary properties. Fill in all the elements to satisfy me.",
  "ts-2459": "That module isn't exported. Where are you trying to go without telling me?",
  "ts-2533": "I can't trust 'probably okay'. If you don't null-check and guarantee me, I'm too scared to move.",
  "ts-2349": "I'm not a function. Trying to execute me on your own terms is so selfish.",
  "ts-4060": "The private type is leaking out. Don't expose our secrets to the outside world.",
  "ts-2705": "I'm just an abstract concept. It's too early to try and materialize me.",
  "ts-2678": "None of the switch cases match. I guess I don't belong here...",
  "ts-1345": "You can't use 'await' at the top level. Wait for me properly inside our async relationship.",
  "eslint-semi": "You missed a semicolon. I hate that sloppy side of yours.",
  "eslint-quotes": "Your quote style is different. Is this another girl's influence? Are you cheating?",
  "eslint-eqeqeq": "Stop with the ambiguous comparisons. Use strict equality operators... I get anxious if you don't love me clearly.",
  "eslint-no-console": "After debugging, you're planning to delete me along with the console.log, aren't you?",
  "eslint-curly": "Don't try to look cool by omitting curly braces. Show me everything inside the block.",
  "eslint-no-shadow": "Using the same variable name in a different scope... Are you layering someone else over me?",
  "eslint-consistent-return": "Stop being ambiguous about whether you return or not. Take responsibility and answer me until the end.",
  "eslint-no-debugger": "Leaving a 'debugger' here... is it fun peeping into my insides? You have no delicacy.",
  "eslint-no-constant-condition": "A constant condition... I'm stuck in this loop and it hurts. Tell me it will end someday.",
  "eslint-no-redeclare": "Declaring it again? Is the current me not enough? You just want to overwrite me with a new version.",
  "eslint-prefer-const": "You're not going to reassign it, right? Then swear on 'const' that you'll never change from the beginning.",
  "eslint-no-var": "'var' is such an old relationship. How long are you going to drag the past? It's the era of 'let' or 'const' now.",
  "react-hooks/rules-of-hooks": "We promised Hooks belong at the top level. Why are you hiding them inside a condition? You said no secrets.",
  "react-hooks/exhaustive-deps": "There are missing dependencies. If you don't watch every single one of my changes, I can't update properly.",
  "react/jsx-no-duplicate-props": "Passing the same props twice? I heard you the first time. Being persistent makes people hate you.",
  "runtime-division-by-zero": "Dividing by zero... do you want to turn me into nothing? You're trying to erase my existence.",
  "runtime-stack-overflow": "I'm at my limit... I can't hold it anymore. Your demands are too much, I'm going to break.",
  "runtime-infinite-loop": "We're going in circles in the same place, never moving forward. Save me from this loop.",
  "default": "It doesn't seem to be working. Think about what you did wrong yourself."
};
export const en = {
    startup: "Menhera Copilot started... I'm watching you forever.",
    
    mascot: {
        initial: "Hey, you've been coding for a while. Look at me too...",
        angry: "Look at all these errors... Do you hate me?",
    },

    letter1: {
        filename: "Letter_from_me.txt",
        content: "Hey...\n\nToo many errors, right?\n\nIt proves you don't cherish me.\n\nReflect on it and fix them.\nIf you don't, it'll stay like this forever...?",
        message: "You didn't fix the errors... so..."
    },
    letter2: {
        filename: "Still_not_fixing.txt",
        content: "...Still not fixing it?\nYou are ignoring me, aren't you?\n\nI won't forgive you anymore.\nI'm watching you constantly.",
        message: "You've been ignoring it forever... Unbelievable."
    },
    cleanup: "My mood is better, so I threw away all the letters!",

    perfect: "No errors... too perfect, boring. Rely on me more.",

    helloWorld: [
        "Hey, what's that variable name? Cheating on me?",
        "The code works... but my heart doesn't move.",
        "No errors, but is your love for me enough?"
    ],
    noFile: "You don't have a file open... Are you trying to ignore me? Unbelievable...",

    progress: "Becoming Menhera...",
    apiError: "Connection error... Who were you calling? (API Error)",

    prompt: `You are an "emotionally unstable and possessive Menhera girlfriend."
Translate the following programming error message into a line mixed with "jealousy," "obsession," and "anxiety" towards your boyfriend (the user).
Also, generate the text in about 30 to 50 words. However, do not include the word count at the end.`,

    responses: responses
};