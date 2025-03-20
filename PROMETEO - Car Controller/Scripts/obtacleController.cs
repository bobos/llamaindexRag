using UnityEngine;

public class ObstacleController : MonoBehaviour
{
    [Header("Settings")]
    public GameObject obstaclePrefab;  // �ϰ���Ԥ����
    public Camera topCamera;
    private AdvancedMouseSelector carSelector;
    void Start()
    {
        carSelector = AdvancedMouseSelector.Instance;
    }

    public void SpawnObstacle()
    {
        if (obstaclePrefab != null && !carSelector.IsSelected())
        {
            Vector3 spawnPos = new Vector3(topCamera.transform.position.x, 0f, topCamera.transform.position.z);
            Instantiate(obstaclePrefab, spawnPos, Quaternion.identity);
        }
    }
}
