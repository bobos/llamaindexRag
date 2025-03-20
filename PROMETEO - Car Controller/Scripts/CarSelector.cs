using UnityEngine;
using System.Collections.Generic;

public class AdvancedMouseSelector : MonoBehaviour
{
    [Header("��������")]
    [SerializeField] private LayerMask carMask;
    public string targetScriptName = "PrometeoCarController"; // ��Ҫ���ƵĽű�����
    public Camera topCamera;
    public Camera mainCamera;
    public LayerMask obstacleLayer;    // �ϰ������ڲ�
    public float zoomSpeed = 3f;       // �����ٶ�
    public float rotateSpeed = 2f;   // ��ת�ٶ�
    
    private float originalZScale;     // ��ʼZ��ߴ�
    private Vector3 lastMousePosition; // ���ڼ������λ��
    private GameObject currentObstacle; // ��ǰѡ�е��ϰ���
    private bool isDragging = false;    // ��ק״̬���
    private Vector3 offset;             // ���λ�����������ĵ�ƫ����
    private float groundZ = 0;          // ����Z���꣨����ʵ�����������

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
        HandleRotation();
        // ������ק
        if (isDragging && Input.GetMouseButton(0))
        {
            if (Input.GetMouseButton(0) && !Input.GetMouseButton(1) && currentObstacle != null)
            {
                Vector3 newPosition = GetMouseWorldPosition() + offset;
                newPosition.y = currentObstacle.transform.position.y; // ����Y��
                currentObstacle.transform.position = newPosition;

                // ��������
                float scroll = Input.GetAxis("Mouse ScrollWheel");
                if (scroll != 0)
                {
                    Vector3 newScale = currentObstacle.transform.localScale;
                    newScale.z = Mathf.Clamp(
                        newScale.z + scroll * zoomSpeed,
                        originalZScale / 6f,
                        originalZScale * 4f
                    );
                    currentObstacle.transform.localScale = newScale;
                }
            }
        }

        // ������ק
        if (Input.GetMouseButtonUp(0))
        {
            isDragging = false;
            currentObstacle = null;
        }

        if (Input.GetMouseButtonDown(0))
        {
            HandleSelection();
        }
    }

    void HandleRotation()
    {
        // �Ҽ�����ʱѡ������
        if (Input.GetMouseButtonDown(1))
        {
            RaycastHit hit;
            Ray ray = topCamera.ScreenPointToRay(Input.mousePosition);

            if (Physics.Raycast(ray, out hit, Mathf.Infinity, obstacleLayer))
            {
                currentObstacle = hit.collider.gameObject;
                lastMousePosition = Input.mousePosition;
            }
        }

        // ��ס�Ҽ���ת
        if (Input.GetMouseButton(1) && currentObstacle != null)
        {
            // ����ˮƽλ�Ʋ�
            float mouseDelta = (Input.mousePosition.x - lastMousePosition.x) * 0.1f;
            
            // Ӧ����ת���������ٶȣ�
            currentObstacle.transform.Rotate(
                0, 
                mouseDelta * rotateSpeed, 
                0,
                Space.World
            );
        }
        lastMousePosition = Input.mousePosition;
    }
    void HandleSelection()
    {   
        Camera camera = mainCamera.isActiveAndEnabled ? mainCamera : topCamera;
        Ray ray = camera.ScreenPointToRay(Input.mousePosition);
        RaycastHit hit;

        //if (Physics.Raycast(ray, out hit, Mathf.Infinity, (1 << carMask) | (1 << obstacleLayer)))
        if (Physics.Raycast(ray, out hit, Mathf.Infinity,  obstacleLayer|carMask))
        {
            if (isSelected) { return; }
            if (isInLayerMask(hit.collider.gameObject.layer, carMask.value))
            {
                Debug.Log("car selected");
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
                    }
                    currentParent = newParent;
                    DisablePreviousScriptWithClear(); // ����ǰ����Clear
                    CacheAndEnableNewScript(script);
                    AssignToAllCarTransforms(newParent); // ͬ�����й����ű�
                }
            } else {
                Debug.Log("obstacle selected");
                currentObstacle = hit.collider.gameObject;
                isDragging = true;

                // ����ƫ�������������꣩
                offset = currentObstacle.transform.position - GetMouseWorldPosition();
                // ��¼��ʼ����
                originalZScale = currentObstacle.transform.localScale.z;
                lastMousePosition = Input.mousePosition;
            }
        } else { 
            ClearAll();
        }
    }
    bool isInLayerMask(int layer, LayerMask layerMask)
    {
        return (layerMask.value & (1 << layer)) != 0;
    }
    // ��ȡ���������ռ��е�λ�ã�XZƽ�棩
    private Vector3 GetMouseWorldPosition()
    {
        Plane plane = new Plane(Vector3.up, Vector3.up * groundZ); // XZƽ��
        Ray ray = topCamera.ScreenPointToRay(Input.mousePosition);
        
        if (plane.Raycast(ray, out float distance))
        {
            return ray.GetPoint(distance);
        }
        return Vector3.zero;
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