using UnityEngine;
using System.Collections.Generic;
using System.Reflection;

public class AdvancedMouseSelector : MonoBehaviour
{
    [Header("基础设置")]
    [SerializeField] private LayerMask carMask;
    public string targetScriptName = "PrometeoCarController"; // 需要控制的脚本名称
    public Camera topCamera;
    public Camera mainCamera;

    private bool isSelected = false;
    private Transform currentParent;       // 当前缓存的父对象
    private PrometeoCarController currentScript;   // 当前缓存的脚本
    private GameManager gameManager;

    List<LidarController> lidarScripts = new List<LidarController>();
    public static AdvancedMouseSelector Instance { get; private set; }

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(this);
        }
        else
        {
            Instance = this;
        }
    }
    void Start()
    {
        gameManager = GameManager.Instance;
        CacheLidarScripts();
    }

    public bool IsSelected()
    {
        return isSelected;
    }

    void CacheLidarScripts()
    {
        GameObject lidarParent = GameObject.Find("lidars"); //找到全局game object by name
        if (lidarParent != null)
        {
            foreach (Transform child in lidarParent.transform)
            {
                LidarController script = child.GetComponent<LidarController>();
                if (script != null)
                {
                    lidarScripts.Add(script);
                }
            }
        }
        else
        {
            Debug.LogError($"未找到Lidar父物体");
        }
    }

    void Update()
    {
        if (!gameManager.IsActive())
        {
            ClearAll();
            return;
        }
        if (Input.GetMouseButtonDown(0))
        {
            HandleSelection();
        }
    }

   void HandleSelection()
    {
        Camera camera = mainCamera.isActiveAndEnabled ? mainCamera : topCamera;
        Ray ray = camera.ScreenPointToRay(Input.mousePosition);
        RaycastHit hit;

        if (Physics.Raycast(ray, out hit, Mathf.Infinity, carMask))
        {
            Transform newParent = GetTopParent(hit.collider.transform);
            if (newParent != null && newParent != currentParent)
            {
                PrometeoCarController script = newParent.GetComponent<PrometeoCarController>();
                if (!script.IsUnlocked())
                {
                    if (!gameManager.UseCarKey(script.GetInstanceID()))
                    {
                        return;
                    }
                    script.EnableIndicator();
                }
                currentParent = newParent;
                DisablePreviousScriptWithClear(); // 禁用前调用Clear
                CacheAndEnableNewScript(script);
                AssignToAllCarTransforms(newParent); // 同步所有关联脚本
            }
        }
        else
        {
            ClearAll();
        }
    }

    void DisablePreviousScriptWithClear()
    {
        if (currentScript != null)
        {
           currentScript.Clear();
           currentScript.enabled = false;
        }
    }

    void AssignToAllCarTransforms(Transform target)
    {
        // 更新主摄像机
        CameraFollow cameraFollow = mainCamera.GetComponent<CameraFollow>();
        if (cameraFollow != null) cameraFollow.carTransform = target;

        foreach (LidarController script in lidarScripts)
        {
            script.carTransform = target;
            script.StartCheck();
        }
    }
    
    Transform GetTopParent(Transform child)
    {
        while (child.parent != null)
        {
            child = child.parent;
        }
        return child;
    }

    void DisablePreviousScript()
    {
        if (currentScript != null)
        {
            currentScript.enabled = false;
            Debug.Log($"已禁用脚本: {currentScript.GetType().Name}");
        }
    }

    void CacheAndEnableNewScript(PrometeoCarController newScript)
    {
        isSelected = true;
        currentScript = newScript;

        if (currentScript != null)
        {
            currentScript.enabled = true;
            Debug.Log($"已启用脚本: {currentScript.GetType().Name}");
        }
        else
        {
            Debug.LogError($"未找到脚本: {targetScriptName}");
        }
    }

    void ClearAll()
    {
        isSelected = false;
        DisablePreviousScript();
        currentParent = null;
        currentScript = null;
        foreach (LidarController script in lidarScripts)
        {
            script.StopCheck();
        }
    }

    // 安全清理（场景切换时调用）
    void OnDestroy()
    {
        ClearAll();
    }
}