using UnityEngine;
using System.Collections.Generic;
using System.Reflection;

public class AdvancedMouseSelector : MonoBehaviour
{
    [Header("��������")]
    [SerializeField] private LayerMask carMask;
    public string targetScriptName = "PrometeoCarController"; // ��Ҫ���ƵĽű�����
    public Camera topCamera;
    public Camera mainCamera;

    private bool isSelected = false;
    private Transform currentParent;       // ��ǰ����ĸ�����
    private PrometeoCarController currentScript;   // ��ǰ����Ľű�
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
        GameObject lidarParent = GameObject.Find("lidars"); //�ҵ�ȫ��game object by name
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
            Debug.LogError($"δ�ҵ�Lidar������");
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
                DisablePreviousScriptWithClear(); // ����ǰ����Clear
                CacheAndEnableNewScript(script);
                AssignToAllCarTransforms(newParent); // ͬ�����й����ű�
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
        // �����������
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
            Debug.Log($"�ѽ��ýű�: {currentScript.GetType().Name}");
        }
    }

    void CacheAndEnableNewScript(PrometeoCarController newScript)
    {
        isSelected = true;
        currentScript = newScript;

        if (currentScript != null)
        {
            currentScript.enabled = true;
            Debug.Log($"�����ýű�: {currentScript.GetType().Name}");
        }
        else
        {
            Debug.LogError($"δ�ҵ��ű�: {targetScriptName}");
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

    // ��ȫ���������л�ʱ���ã�
    void OnDestroy()
    {
        ClearAll();
    }
}