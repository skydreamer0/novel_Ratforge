import os

def count_words(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            # Count non-whitespace characters
            count = len(''.join(content.split()))
            return count
    except Exception as e:
        return f"Error: {e}"

files = [
    r"d:\專案\novel_Ratforge\章稿\第9卷_墜落地\第281章-男爵的獵犬.md",
    r"d:\專案\novel_Ratforge\章稿\第9卷_墜落地\第282章-穿越神經荒漠.md",
    r"d:\專案\novel_Ratforge\章稿\第9卷_墜落地\第283章-情緒殘響.md",
    r"d:\專案\novel_Ratforge\章稿\第9卷_墜落地\第284章-代碼崩潰.md"
]

print("Is File Path Valid?")
for file in files:
    try:
        exists = os.path.exists(file)
        print(f"{os.path.basename(file)}: {exists}")
    except:
        print(f"Error checking path: {file}")

print("\nWord Counts (Characters):")
for file in files:
    count = count_words(file)
    print(f"{os.path.basename(file)}: {count}")
