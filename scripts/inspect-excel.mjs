import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
const parser = new DOMParser();
const tags = (doc, name) => Array.from(doc.getElementsByTagName('*')).filter(node=>node.localName===name);
const profile = [];
for (const name of readdirSync('.').filter(name=>name.endsWith('.xlsx'))) {
  try {
    const zip = unzipSync(readFileSync(name), {filter:file=>file.name==='xl/workbook.xml'||file.name==='xl/_rels/workbook.xml.rels'||file.name==='xl/sharedStrings.xml'||/^xl\/worksheets\/sheet\d+\.xml$/.test(file.name)});
    const doc = parser.parseFromString(strFromU8(zip['xl/workbook.xml']),'text/xml');
    const rels = tags(parser.parseFromString(strFromU8(zip['xl/_rels/workbook.xml.rels']),'text/xml'),'Relationship');
    const sheets = tags(doc,'sheet').map(sheet=>({name:sheet.getAttribute('name'),target:rels.find(rel=>rel.getAttribute('Id')===sheet.getAttribute('r:id'))?.getAttribute('Target')}));
    const shared = zip['xl/sharedStrings.xml'] ? tags(parser.parseFromString(strFromU8(zip['xl/sharedStrings.xml']),'text/xml'),'si').map(si=>si.textContent) : [];
    const entry={file:name,sheets:[]};
    for(const sheet of sheets) {
      const target=sheet.target?.startsWith('/')?sheet.target.slice(1):'xl/'+sheet.target;
      const xml=zip[target];if(!xml)continue;
      const text=strFromU8(xml), top=(text.match(/<(?:\w+:)?row\b[^>]*>[\s\S]*?<\/(?:\w+:)?row>/g)||[]).slice(0,9);
      const rows=top.map(row=>{
        const dom=parser.parseFromString(row,'text/xml');
        return {row:dom.documentElement.getAttribute('r'),cells:tags(dom,'c').map(c=>{
          const raw=tags(c,'v')[0]?.textContent;
          return {cell:c.getAttribute('r'),value:c.getAttribute('t')==='s'?shared[Number(raw)]:c.getAttribute('t')==='inlineStr'?c.textContent:raw};
        }).filter(c=>c.value!==undefined && c.value!=='')};
      });
      entry.sheets.push({name:sheet.name,dimension:text.match(/<dimension[^>]*ref="([^"]+)"/)?.[1],topRows:rows});
    }
    profile.push(entry);
  } catch(error){profile.push({file:name,error:error.message});}
}
writeFileSync('excel-profile.local.json',JSON.stringify(profile,null,2));
for(const file of profile){console.log(JSON.stringify({file:file.file,error:file.error,sheets:file.sheets?.map(sheet=>sheet.name)}));}
