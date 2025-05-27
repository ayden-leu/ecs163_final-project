export const width = window.innerWidth;
export const height = window.innerHeight;

export const transitionTime = 100;

export let lineGraph = {};
lineGraph.offset = {x: 0, y: 0};
lineGraph.width = width/2;
lineGraph.height = height/2;
lineGraph.labels = {
    x: {
        text: "Date",
        offset: {x: 0 + lineGraph.width/2, y: 40 + lineGraph.height}
    },
    y: {
        text: "Average Value of Homes",
        offset: {x: -80, y: -lineGraph.height/2}
    },
    size: 20
};
lineGraph.ticks = {
    size: 10
};
lineGraph.line = {
    width: 1.5
};

lineGraph.content = {
    offset: {x: 0, y: 0}
}