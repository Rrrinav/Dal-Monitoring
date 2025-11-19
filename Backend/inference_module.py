# inference_module.py
import torch
import numpy as np
from PIL import Image
from torchvision import transforms
import albumentations as A
from pathlib import Path
from model_custom_noAsym import CustomENet

# ==============================================================================
# --- PATHS & MODEL SETUP ---
# ==============================================================================
model_path = Path("output_CustomENetNoAsym") / "best_model.pth"
output_dir = Path("output")
output_dir.mkdir(exist_ok=True)

# Image sizes
image_size = (720, 1280)   # (H, W)
target_size = (1280, 720)  # (W, H) for saving visuals

# Device
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[Inference] Using device: {device}")

# Load model
print("[Inference] Loading CustomENet model...")
model = CustomENet(in_channels=3, num_classes=2)
state_dict = torch.load(model_path, map_location=device, weights_only=True)
model_state_dict = model.state_dict()
filtered_state_dict = {k: v for k, v in state_dict.items() if k in model_state_dict}
model_state_dict.update(filtered_state_dict)
model.load_state_dict(model_state_dict)
model.to(device)
model.eval()
print(f"[Inference] Model loaded successfully from {model_path}")

# Preprocessing transforms
to_tensor = transforms.ToTensor()
normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
resize_transform = A.Compose([
    A.Resize(height=image_size[0], width=image_size[1]),
])


# ==============================================================================
# --- HELPER FUNCTIONS ---
# ==============================================================================

def preprocess_image(img_path):
    """Resize, normalize, and prepare image tensor for model."""
    image = Image.open(img_path).convert('RGB')
    image = np.array(image)
    transformed = resize_transform(image=image)
    image = transformed['image']
    image = to_tensor(image)
    image = normalize(image)
    return image.unsqueeze(0).to(device)


def calculate_trash_score(pred_mask):
    """Calculate percentage of pixels predicted as trash."""
    total_pixels = pred_mask.size
    plastic_pixels = np.sum(pred_mask == 1)
    return round((plastic_pixels / total_pixels) * 100, 2)


def save_prediction_outputs(pred, original_img_path, base_name):
    """Save both mask and overlay images to output folder."""
    pred_img = np.zeros((image_size[0], image_size[1], 3), dtype=np.uint8)
    pred_img[pred == 1] = [255, 0, 0]  # red for plastic

    # Save mask image
    mask_pil = Image.fromarray(pred_img)
    mask_resized = mask_pil.resize(target_size, Image.NEAREST)
    mask_save_path = output_dir / f"{base_name}_mask.png"
    mask_resized.save(mask_save_path)

    # Overlay red on original image
    original_img = Image.open(original_img_path).convert('RGB')
    original_resized = original_img.resize(target_size, Image.BILINEAR)
    overlay_array = np.array(original_resized)
    red_mask = np.array(mask_resized)[:, :, 0] > 200
    overlay_array[red_mask] = [255, 0, 0]
    overlay_img = Image.fromarray(overlay_array)
    overlay_save_path = output_dir / f"{base_name}_overlay.png"
    overlay_img.save(overlay_save_path)

    print(f"[Inference] Saved mask -> {mask_save_path}")
    print(f"[Inference] Saved overlay -> {overlay_save_path}")


# ==============================================================================
# --- MAIN INFERENCE ENTRYPOINT ---
# ==============================================================================

def run_inference(image_path):
    """
    Runs ENet inference on an image, saves output visuals, and returns trash_score.
    """
    base_name = Path(image_path).stem
    with torch.no_grad():
        image_tensor = preprocess_image(image_path)
        output = model(image_tensor)
        pred = torch.argmax(output, dim=1).squeeze(0).cpu().numpy()

    trash_score = calculate_trash_score(pred)
    save_prediction_outputs(pred, image_path, base_name)
    return trash_score
