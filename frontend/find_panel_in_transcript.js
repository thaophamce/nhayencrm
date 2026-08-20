import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\Admin\\.gemini\\antigravity\\brain\\3eaa0378-9f44-46bf-a642-22370745286c\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let index = 0;
  for await (const line of rl) {
    index++;
    if (line.includes('ChatContactPanel.vue')) {
      // Tìm xem có write_to_file hoặc replace_file_content cho ChatContactPanel.vue không
      if (line.includes('write_to_file') || line.includes('replace_file_content')) {
        console.log(`LINE ${index} has modification call. Length: ${line.length}`);
        // In 500 ký tự đầu tiên
        console.log(line.slice(0, 500));
        console.log("==========================================");
      }
    }
  }
}

main().catch(console.error);
