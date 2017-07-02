
function DLL() {
    this.head = this.tail = null;
    // this.head = null;
    // this.tail = null;
}

DLL.prototype.insertAfter = function (node, newNode) {
    newNode.prev = node;
    newNode.next = node.next;
    node.next.prev = newNode;
    node.next = newNode;
};

DLL.prototype.push = function (newNode) {
    this.insertAfter (this.tail, newNode);
};

module.exports = {
    DLL:    DLL
};
