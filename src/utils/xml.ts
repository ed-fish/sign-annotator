/** Escape XML special characters */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Parse XML string to Document */
export function parseXml(xmlString: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    throw new Error(`XML parse error: ${errorNode.textContent}`);
  }
  return doc;
}

/** Serialize Document to XML string */
export function serializeXml(doc: Document): string {
  const serializer = new XMLSerializer();
  let xml = serializer.serializeToString(doc);
  // Ensure XML declaration
  if (!xml.startsWith('<?xml')) {
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
  }
  return xml;
}
