"""Local Whisper worker. Progress is newline-delimited JSON; audio stays on this PC."""
import argparse
import ctypes
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def emit(**message):
    print(json.dumps(message, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--model", default="small", choices=["tiny", "base", "small", "medium", "large-v3", "turbo"])
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--language", default="zh")
    parser.add_argument("--cache", required=True)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        import ctranslate2
        from faster_whisper import WhisperModel
        from faster_whisper.utils import download_model
    except ImportError:
        raise RuntimeError("本地 Whisper 尚未安装，请运行 安装本地语音.cmd")
    device = args.device
    if device == "auto":
        device = "cpu"
        try:
            if ctranslate2.get_cuda_device_count() > 0:
                if os.name == "nt":
                    ctypes.WinDLL("cublas64_12.dll")
                    ctypes.WinDLL("cudnn64_9.dll")
                device = "cuda"
        except (RuntimeError, OSError):
            pass
    if args.check:
        cached = False
        try:
            cached_path = download_model(args.model, cache_dir=args.cache, local_files_only=True)
            cached = all((Path(cached_path) / name).is_file() for name in ["model.bin", "config.json", "tokenizer.json"])
        except Exception:
            pass
        emit(ready=True, model=args.model, cached=cached, device=device)
        return
    try:
        model_path = download_model(args.model, cache_dir=args.cache, local_files_only=True)
        if not all((Path(model_path) / name).is_file() for name in ["model.bin", "config.json", "tokenizer.json"]):
            raise FileNotFoundError("本地模型缓存尚不完整")
    except Exception:
        emit(progress=0, message=f"首次下载 Whisper {args.model} 模型，完成后会保存在本机")
        model_path = download_model(args.model, cache_dir=args.cache)
    if args.prepare:
        emit(progress=100, message="模型已缓存，可离线识别", model=args.model)
        return
    emit(progress=2, message=f"加载本地 Whisper {args.model} · {device.upper()}")

    def recognize(target_device):
        model = WhisperModel(model_path, device=target_device,
                             compute_type="int8" if target_device == "cpu" else "int8_float16",
                             cpu_threads=min(8, os.cpu_count() or 4), local_files_only=True)
        segments, info = model.transcribe(args.input, language=None if args.language == "auto" else args.language,
                                          beam_size=5, vad_filter=True, condition_on_previous_text=False)
        result = []
        for segment in segments:
            text = segment.text.strip()
            if text and segment.end > segment.start:
                result.append({"start": round(segment.start, 3), "end": round(segment.end, 3), "text": text})
            emit(progress=min(98, round(segment.end / max(info.duration, 1) * 95) + 3),
                 message=f"本地识别 {segment.end:.0f} / {info.duration:.0f} 秒 · {target_device.upper()}")
        return {"segments": result, "language": info.language, "device": target_device, "model": args.model}

    try:
        result = recognize(device)
    except RuntimeError:
        if args.device != "auto" or device != "cuda":
            raise
        emit(progress=2, message="GPU 运行库不可用，正在改用 CPU 本地识别")
        result = recognize("cpu")
    dest = Path(args.output)
    temp = dest.with_suffix(".tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    temp.replace(dest)
    emit(progress=100, message="本地语音识别完成", count=len(result["segments"]))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr, flush=True)
        sys.exit(1)
