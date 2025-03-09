using UnityEngine;
using System.Collections;

public class CameraSwitcherWithPool : MonoBehaviour
{
    public Camera mainCamera;
    public Camera topCamera;
    private Coroutine disableCoroutine;

    private AdvancedMouseSelector carSelector;
    private bool isCurrentMain = false;
    void Start()
    {
        mainCamera.gameObject.SetActive(isCurrentMain);
        topCamera.gameObject.SetActive(!isCurrentMain);
        carSelector = AdvancedMouseSelector.Instance;
    }
    void Update()
    {
        if (carSelector.IsSelected() && !isCurrentMain)
        {
            isCurrentMain = true;
            SwitchCamera(true);
            return;
        }
        if (!carSelector.IsSelected() && isCurrentMain)
        {
           //顶视角
           isCurrentMain = false;
           SwitchCamera(false);
        }
    }

    public void SwitchCamera(bool setMain)
    {
        // 延迟禁用旧摄像机（分散开销）
        if (disableCoroutine != null) StopCoroutine(disableCoroutine);
        disableCoroutine = StartCoroutine(DisableCameraDelayed(setMain, 2));

        // 立即启用新摄像机
        if (setMain) mainCamera.gameObject.SetActive(true);
        else topCamera.gameObject.SetActive(true);
    }

    private IEnumerator DisableCameraDelayed(bool setMain, int delayFrames)
    {
        for (int i = 0; i < delayFrames; i++) yield return null;
        if (setMain) topCamera.gameObject.SetActive(false);
        else mainCamera.gameObject.SetActive(false);
    }
}
