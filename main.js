const dataset = "./data/insert_file_name.csv";

// main stuff
const svg = d3.select("svg");

// get and process dataset
d3.csv(dataset).then(rawData =>{
    console.log("rawData", rawData);

    }).catch(function(error){
    console.log(error);
});