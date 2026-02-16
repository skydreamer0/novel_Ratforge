import os
import re
import json

# 設定
CHAPTERS_DIR = "/Users/george/Library/CloudStorage/OneDrive-MSFT/0.專案/novel/novel_Ratforge/章稿"

# 模式與略過邏輯
FORBIDDEN_PATTERNS = [
    r"(?<!# )第[一二三四五六七八九十0-9]+[卷章]",
    r"(?<!\w)Ch ?[0-9]+",  # Updated to allow optional space
    r"Chapter ?[0-9]+",    # Updated to allow optional space
    r"卷末",
    r"本章",
    r"下一章"
]
combined_pattern = re.compile("|".join(FORBIDDEN_PATTERNS), re.IGNORECASE)

def fix_content(content, path):
    lines = content.splitlines()
    new_lines = []
    changes_made = False
    
    for i, line in enumerate(lines):
        # 略過前兩行標體與 > 引用
        if i < 2 or line.strip().startswith(">"):
            new_lines.append(line)
            continue
            
        if combined_pattern.search(line):
            # 1. 處理 (本章完), (第X卷完) 系列 - 直接移除
            fixed_line = re.sub(r"[\(（].*?([卷章]完).*?[\)）]", "", line)
            fixed_line = re.sub(r"第[一二三四五六七八九十0-9]+卷，完。", "", fixed_line)
            
            # 2. 處理內文中的提及 (啟發式替換)
            # 將 "在第X卷中" 類型的詞替換成模糊的時間描述
            fixed_line = re.sub(r"在第[一二三四五六七八九十0-9]+卷中", "在之前的行動中", fixed_line)
            fixed_line = re.sub(r"第一卷的時候", "當初最早的時候", fixed_line)
            fixed_line = re.sub(r"Ch ?[0-9]+ ?那次", "之前那次事件", fixed_line, flags=re.IGNORECASE)
            
            # 特殊替換：Ch 104 -> 在以前
            fixed_line = re.sub(r"在 ?Ch ?104 ?中", "在之前的測試中", fixed_line, flags=re.IGNORECASE)

            # 如果還是有殘餘的禁詞，進行通用模糊處理
            fixed_line = re.sub(r"第[0-9]+章", "前段時間", fixed_line)
            fixed_line = re.sub(r"本章", "此段", fixed_line)
            
            if fixed_line != line:
                changes_made = True
                new_lines.append(fixed_line)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
            
    return "\n".join(new_lines), changes_made

def run_fix():
    report = []
    for root, dirs, files in os.walk(CHAPTERS_DIR):
        for file in files:
            if file.endswith(".md"):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content, changed = fix_content(content, path)
                
                if changed:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    report.append(path)
    return report

if __name__ == "__main__":
    fixed_files = run_fix()
    if fixed_files:
        print(f"COMPLETE: 已自動修正 {len(fixed_files)} 個文件。")
        for f in fixed_files:
            print(f"- {f}")
    else:
        print("SUCCESS: 沒有需要修正的文件。")
