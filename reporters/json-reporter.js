// reporters/json-reporter.js
export default function jsonReporter(result) {
    console.log(JSON.stringify(result, null, 2));
}