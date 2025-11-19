import torch

# 1. Print PyTorch version
print(f"PyTorch Version: {torch.__version__}")

# 2. Check for MPS (GPU) device availability (Apple Silicon only)
if torch.backends.mps.is_available():
    mps_device = torch.device("mps")
    x = torch.ones(1, device=mps_device)
    print(f"MPS is available. Tensor is on device: {x.device}")
    print(x)
else:
    print("MPS device not found. Running on CPU.")

# Exit the interpreter
exit()