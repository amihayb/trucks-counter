// Load counters or defaults
let counters = JSON.parse(localStorage.getItem("counters")) || [
    { name: "WFP", value: 0 },
    { name: "סקטור", value: 0 },
    { name: "WCK", value: 0 }
];

function render() {
    const container = document.getElementById("counterContainer");
    container.innerHTML = "";

    counters.forEach((counter, index) => {
        const div = document.createElement("div");
        div.className = "counter";

        div.innerHTML = `
			<div class="counter-header">
				${counter.name}
			</div>

			<div class="number-row">
    <button class="reset-btn" onclick="resetCounter(${index})">↺</button>

    <input type="number" class="number-input" value="${counter.value}"
        oninput="updateValue(${index}, this.value)}">

    <div class="number-spacer"></div>
</div>


			<div class="btn-row">
				<button class="btn-plus" onclick="changeValue(${index}, 1)">+</button>
				<button class="btn-minus" onclick="changeValue(${index}, -1)">−</button>
			</div>
`		;


        container.appendChild(div);
    });

    updateTotal();
    save();
}

/* Logic */
function addCounter() {
    counters.push({ name: "מונה חדש", value: 0 });
    render();
}

function removeLastCounter() {
    if (counters.length > 0) {
        counters.pop();
        render();
    }
}

function resetAll() {
    counters.forEach(c => c.value = 0);
    render();
}

function updateName(index, name) {
    counters[index].name = name;
    save();
}

function updateValue(index, val) {
    counters[index].value = parseInt(val) || 0;
    updateTotal();
    save();
}

function changeValue(index, delta) {
    counters[index].value += delta;
    render();
}

function resetCounter(index) {
    counters[index].value = 0;
    render();
}

/* Total & Save */
function updateTotal() {
    const total = counters.reduce((sum, c) => sum + c.value, 0);
    document.getElementById("total").innerText = "סה״כ: " + total;
}

function save() {
    localStorage.setItem("counters", JSON.stringify(counters));
}

/* WhatsApp Share */
function sendWhatsApp() {
    let message = "כניסת משאיות עד כה:\n";

    counters.forEach(c => {
        message += `${c.name}: ${c.value} משאיות\n`;
    });

    const total = counters.reduce((sum, c) => sum + c.value, 0);
    message += `\nסה\"כ ${total} משאיות`;

    const encoded = encodeURIComponent(message);
    const url = "https://wa.me/?text=" + encoded;

    window.open(url, "_blank");
}

render();
