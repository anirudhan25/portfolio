import os
from PIL import Image, ImageEnhance, ImageOps

def apply_paper_effect(input_path, output_path):
    try:
        img = Image.open(input_path).convert("RGB")

        # 1. Grayscale
        img = ImageOps.grayscale(img).convert("RGB")

        # 2. Sepia tone
        pixels = img.load()
        for y in range(img.height):
            for x in range(img.width):
                r, g, b = pixels[x, y]

                tr = int(0.393 * r + 0.769 * g + 0.189 * b)
                tg = int(0.349 * r + 0.686 * g + 0.168 * b)
                tb = int(0.272 * r + 0.534 * g + 0.131 * b)

                pixels[x, y] = (
                    min(tr, 255),
                    min(tg, 255),
                    min(tb, 255),
                )

        # 3. Tone adjustments
        img = ImageEnhance.Contrast(img).enhance(0.9)
        img = ImageEnhance.Brightness(img).enhance(0.95)

        # 4. Paper tint overlay
        overlay = Image.new("RGB", img.size, (235, 225, 200))
        img = Image.blend(img, overlay, alpha=0.15)

        # Save
        img.save(output_path)

    except Exception as e:
        print(f"Skipped {input_path}: {e}")


def process_folder(input_dir, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    supported = (".png", ".jpg", ".jpeg", ".webp")

    for filename in os.listdir(input_dir):
        if filename.lower().endswith(supported):
            input_path = os.path.join(input_dir, filename)

            # Ensure consistent output format (optional: force .jpg)
            name, _ = os.path.splitext(filename)
            output_path = os.path.join(output_dir, f"{name}.jpg")

            apply_paper_effect(input_path, output_path)
            print(f"Processed: {filename}")


if __name__ == "__main__":
    INPUT_FOLDER = "images_raw"
    OUTPUT_FOLDER = "images_paper"

    process_folder(INPUT_FOLDER, OUTPUT_FOLDER)