/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const defaultIndicators = new Map(
    Object.entries({
        j: "Joking",
        hj: "Half Joking",
        s: "Sarcastic",
        _sarc: "Sarcastic",
        gen: "Genuine",
        _g: "Genuine",
        genq: "Genuine Question",
        _gq: "Genuine Question",
        srs: "Serious",
        nsrs: "Non-Serious",
        pos: "Positive Connotation",
        _pc: "Positive Connotation",
        neu: "Neutral Connotation",
        neg: "Negative Connotation",
        _nc: "Negative Connotation",
        p: "Platonic",
        r: "Romantic",
        a: "Alterous",
        c: "Copypasta",
        l: "Lyrics",
        _ly: "Lyrics",
        lh: "Light-Hearted",
        nm: "Not Mad",
        nbh: "Not Directed At Anybody Here",
        nay: "Not Directed At You",
        ay: "Directed At You",
        nj: "Not Joking",
        naj: "Not A Joke"
    })
);

export default defaultIndicators;
